# AI Product Build Framework — Specification v1.0

Nov 25, 2026 · @Apstrog

## 1. Purpose and scope

Every AI product in the portfolio is built on one shared chassis: the same classification, lifecycle, artifacts, architecture and standards. That lets 200 different ideas be staffed, reviewed, compared and audited the same way. The problem, users, domain knowledge and interface change from product to product; how each product is built, measured, secured and priced does not.

**What the framework fixes and what each product decides**

| Fixed by the framework (the chassis) | Decided by each product (the body) |
| --- | --- |
| Classification code and the requirements it triggers (section 3) | The problem, the users and the value promised |
| Lifecycle stages, gates and kill rules (section 4) | What to build in each stage, within the timebox |
| Required artifacts and repository layout (section 5) | The content of those artifacts |
| Reference architecture and shared platform services (section 6) | Domain logic, tools, skills and UI built on top |
| Engineering, eval, ops, security, UX, economics and interop standards (sections 7 to 13) | Which approved models to use, thresholds above the floor, price level |
| Portfolio metrics and cadence (section 14) | Product-specific metrics added to the standard set |

**How to read requirements.** MUST is mandatory: a product cannot pass a gate without it unless the portfolio board grants a written waiver. SHOULD is the default: departing from it needs a one-line reason in the product's design record. MAY is optional. Every requirement has an ID (for example HAR-03) so reviews, waivers and audits can cite it.

**Proportionality.** Requirements scale with a product's class, so a low-risk internal summarizer carries a fraction of the evidence a high-risk hiring agent does. Section 3 defines the classes, and later sections say which classes each rule applies to.

**Scope.** The framework applies to any product whose core value depends on model output: internal tools, customer apps, agents, APIs and embedded features. It does not cover training foundation models. Vendor-specific values (models, prices, protocol versions, legal dates) stay out of the rules and live in the volatile defaults register (section 15), because they change monthly.

**Relationship to the idea scorecard.** The idea scorecard decides whether an idea deserves money (business evidence); this framework decides how it is built and run (build evidence). Both share the same stages and gates (section 4), so every gate review checks the two together. The scorecard's knockouts, margin floors and calibrations (Local or Export, Solo or Funded) apply unchanged.

## 2. Core principles

Ten principles sit behind every rule in this spec; when a case is not covered, decide by them. Each reflects what the late-2026 research showed separates AI products that reach production from those that stall.

1. **The model is a replaceable part.** Frontier tiers from Anthropic, OpenAI and Google turned over several times in November 2026 alone, and top models sit within about 25 Elo points of each other. Products reach models only through the gateway and must pass their evals on more than one.
2. **Engineer the harness, not the prompt.** Durable advantage now lives in the system around the model: harness, context, tools and evals.
3. **Start simple; autonomy is earned.** Only 16% of enterprise deployments qualify as true agents (Menlo Ventures, December 2025), and Gartner predicts over 40% of agentic projects will be cancelled by end-2027. Default to a fixed workflow and add autonomy only where evals show it pays.
4. **No eval, no ship.** Evals are written from real examples before features, and release decisions rest on consistency (pass^k), not demos.
5. **The maker never grades its own work.** Agents rate their own output too generously, so a separate evaluator checks it, ideally by exercising the real result.
6. **Cost per successful task is a product metric from day one.** AI products run at roughly 50 to 60% gross margin against 80 to 90% for SaaS, so margin is designed, not discovered.
7. **Assume prompt injection.** Any product that reads untrusted content and holds tool privileges is designed as if it will be hijacked.
8. **Agents are users too.** Every product exposes its capabilities over MCP and its know-how as Skills, so other agents can use it.
9. **Build once, reuse 200 times.** Anything two products need belongs in the platform, not in either product.
10. **Delete scaffolding as models improve.** Every harness component encodes an assumption about what the model cannot do. Re-test it at each model upgrade and remove what is no longer needed.

## 3. Product classification

Every product gets a three-part code at intake: **Archetype, Autonomy level, Risk tier**. For example, `EXT-A1-R2` is an extractor whose output a person approves, handling customer data. The code, not the idea, decides which patterns, thresholds and controls apply, and each axis drives one kind of requirement:

- **Archetype** decides how the product is built and measured: harness pattern, eval method, metrics and pricing unit.
- **Autonomy level** decides how reliable it must be and where people step in.
- **Risk tier** decides how much assurance, review and compliance evidence it carries.

The code is recorded in the product manifest (section 5) and reviewed at every gate. A product whose code changes, for example on an autonomy promotion, re-runs the checks for its new class.

### 3.1 Archetype: what the product does

A product with several jobs takes the archetype of the job that carries the most risk and lists the others as secondary.

| Code | Archetype | Typical ideas | Default pattern | Primary grader | Default pricing unit | North-star metric |
| --- | --- | --- | --- | --- | --- | --- |
| GEN | Generator | Drafts, reports, designs, code, marketing copy | Generate, evaluate, revise loop | Rubric-based model grader calibrated on human-scored samples | Credits per output | Share of outputs accepted without major edits |
| EXT | Extractor or transformer | Document and invoice parsing, classification, tagging, summaries, translation | Fixed pipeline on a small model | Deterministic comparison with a labelled gold set | Per document or record | Field-level accuracy against the human baseline |
| ANS | Answerer or advisor | Support assistant, knowledge search, policy Q&A, copilots | Retrieval as tools, cited answer, escalation path | Correctness and groundedness against reference answers | Per resolution, or base plan plus credits | Resolved without escalation |
| AGT | Task agent | Order entry, reconciliation, booking, ticket fixing, app building | Planner and executor with a separate evaluator, behind approval gates | Final-state check in a sandbox | Per completed task, or credits | Task success at pass^k |
| CNV | Real-time conversational | Phone agents, voice tutors, live interviewers | Fast conversational layer that hands reasoning to a slower model | Simulated conversations plus latency | Per minute | Goal completion within the latency target |
| MON | Monitor or proactive | Fraud flags, churn watch, inbox triage, compliance monitoring | Event-driven pipeline with thresholded escalation | Precision and recall on labelled events | Per monitored entity per month | Precision at the target recall |

### 3.2 Autonomy level: what the product may do without a person

Each level is governed differently, following Gartner's May 2026 advice to govern agents by autonomy level rather than with one rule for all. New products launch one level below their target and are promoted only on evidence (thresholds in section 8, promotion in section 14).

| Level | Name | The product | A person | Minimum controls |
| --- | --- | --- | --- | --- |
| A0 | Assist | Suggests inline | Does the work | Feedback capture |
| A1 | Draft and approve | Produces complete output | Approves each output before it takes effect | Review screen with a diff, audit log |
| A2 | Act within bounds | Takes reversible actions within scoped permissions | Approves every irreversible or external action | Approval gates, budgets, undo |
| A3 | Act and report | Completes tasks end to end within policy limits | Reviews samples and exceptions | Exception queue, output sampling, kill-switch drill |
| A4 | Autonomous | Runs unattended over long horizons | Sets goals and audits | All A3 controls plus long-run evals and periodic audit |

### 3.3 Risk tier: what happens if it is wrong

The tier is the highest one reached on any of five questions: who is affected, whether errors can be reversed, how sensitive the data is, whether the domain is regulated, and whether the product can move money or act on outside systems.

| Tier | Name | Definition | Examples |
| --- | --- | --- | --- |
| R1 | Low | Internal users, reversible, no personal data | Internal meeting summarizer |
| R2 | Moderate | Customer-facing or uses personal data; errors are recoverable | Support assistant, marketing generator |
| R3 | High | Affects people's rights, money, health or safety; EU AI Act Annex III areas (hiring, credit, education, biometrics); moves money or data outside | Loan-document agent, candidate screener |
| R4 | Restricted | Prohibited uses, or gated dual-use capability (offensive cyber, biology) | Exploit generation, non-consensual intimate imagery |

R4 ideas are rejected unless the portfolio board approves them and the model vendor's verification programme admits them. R3 ideas fall under the idea scorecard's KO4: proceed only when the controls below are funded.

### 3.4 What the risk tier triggers

These are defaults; the portfolio board may raise them but not lower them. Autonomy-driven reliability thresholds are in section 8.

| Requirement | R1 | R2 | R3 |
| --- | --- | --- | --- |
| Threat model | Platform checklist, before G3 | Full model, before G2 | Full model, before G1 |
| Safety and injection eval set | Platform standard suite | Standard suite plus product-specific attacks | Both, plus an external red team before G3 |
| Expert-labelled eval items | Not required | For critical tasks | For all tasks; fairness checks where people are affected |
| Live transcript review | 20 a week | 50 a week plus every flagged case | Daily sample plus every adverse decision |
| Compliance evidence | None | Privacy review | Full compliance file (section 10) |
| On-call | Business hours | 24/7 if customer-facing | 24/7 plus quarterly kill-switch drill |
| Gate sign-off | Pod lead and platform reviewer | Adds a risk reviewer | Adds the portfolio board |

## 4. Lifecycle and stage gates

Every product moves through the same six stages and four gates, and each gate checks business evidence from the idea scorecard and build evidence from this framework together. Timeboxes cap how long an unproven idea can occupy a pod.

*(Diagram omitted in this export: product lifecycle · 6 stages, 4 gates. The text around it and Appendix C carry the same rules.)*

Read each stage across: the business column says whether buyers want it, the build column whether it can be made reliably and profitably. G3 is the costliest decision, so it goes to the portfolio board.

- **LIFE-01** Stages cannot be skipped. A product sits at the earliest stage whose gate it has not passed.
- **LIFE-02** A gate has four outcomes: Advance, Iterate (within the timebox), Park or Reject. A parked product reopens only with new evidence at E3 or above.
- **LIFE-03** A missed timebox gets one extension of half its length; a second miss parks the product (GOV-04).
- **LIFE-04** Any idea scorecard knockout (KO1 to KO10) ends the stage at once, whatever the build evidence says.
- **LIFE-05** Products launch one autonomy level below target and are promoted only after G3 (GOV-05).
- **LIFE-06** The full checklist for each gate is in Appendix C.

## 5. The Product Dossier

Every product keeps the same 15 artifacts in the same repository layout, so a reviewer can open any of the 200 products and find the same things in the same places. Each artifact starts at the stage shown and is kept current afterwards. A missing or stale artifact blocks the gate.

| # | Artifact | What it holds | Starts at | Owner | Applies to |
| --- | --- | --- | --- | --- | --- |
| 1 | Product Card | One page: problem, buyer, user, code, success metric, kill criteria (Appendix A) | Stage 0 | Product owner | All |
| 2 | Manifest (`product.yaml`) | Machine-readable ID, code, stage, owners, models, SLOs, price; feeds the portfolio dashboard (Appendix B) | Stage 0 | Product owner | All |
| 3 | Scorecard record | Idea scorecard scores, evidence levels and next tests | Stage 0 | Product owner | All |
| 4 | Behaviour spec | What the product must and must not do, tone, refusals, escalation, and what success means for each task | Stage 1 | Product owner with eval owner | All |
| 5 | Eval suite | Tasks, graders, thresholds and results history (section 8) | Stage 1 | Eval owner | All |
| 6 | Data and context map | Sources, access permissions, personal data, retention | Stage 1 | Engineering lead | All |
| 7 | Harness design record | Chosen pattern, why each component exists, the model weakness each one covers | Stage 2 | Engineering lead | All |
| 8 | Routing table | Each step's model tier, effort level and fallback | Stage 2 | Engineering lead | All |
| 9 | Threat model | Injection paths, tool privileges, exfiltration routes, mitigations | Per section 3.4 | Security reviewer | All (R1 as a checklist) |
| 10 | Unit-economics sheet | Cost per successful task, price, gross margin, heavy-user stress test | Stage 1 estimate, Stage 3 measured | Product owner | All |
| 11 | Agent interface | MCP server definition and Skills (section 13) | Stage 3 | Engineering lead | All |
| 12 | Runbook and SLOs | On-call, kill switch, incident steps, SLO targets | Stage 3 | Engineering lead | All |
| 13 | Compliance file | Jurisdiction mapping, EU AI Act classification, disclosures, data protection assessment | Stage 2 for R3, Stage 3 for R2 | Risk reviewer | R2, R3 |
| 14 | Gate records | Evidence shown, decision, waivers granted | Each gate | Pod lead | All |
| 15 | Change log | Model swaps, harness changes, eval deltas, incidents | Stage 2 | Engineering lead | All |

**Requirements**

- **DOS-01** Every product MUST be created from the platform template, which generates the layout below. Hand-made layouts are not accepted at G1.
- **DOS-02** The manifest MUST be the single source of truth for portfolio reporting. Dashboards read manifests, never spreadsheets kept by hand.
- **DOS-03** Artifacts MUST be versioned in the same repository as the code, so a model or harness change and its eval results land in the same commit.
- **DOS-04** Gate reviews MUST work from the dossier alone. No separate slide decks.
- **DOS-05** The product ID SHOULD match the idea's row ID in the product catalog when the idea came from it.

**Standard repository layout**

```
products/<product-id>/
  product.yaml              manifest: code, stage, owners, models, SLOs, price
  product-card.md
  scorecard.md              idea scorecard record
  behavior-spec.md
  AGENTS.md                 instructions for coding agents working in this repo
  evals/
    tasks/                  capability, regression and safety sets
    graders/
    thresholds.yaml
    results/
  harness/
    design-record.md
    routing.yaml
  skills/<skill-name>/SKILL.md
  mcp/server.yaml
  data/context-map.md
  security/threat-model.md
  economics/unit-economics.md
  ops/runbook.md
  ops/slos.yaml
  compliance/
  gates/G0.md ... G3.md
  CHANGELOG.md
```

The `AGENTS.md` file matters more than it looks. Coding agents have made prototypes nearly free, so the bottleneck has moved to specification, review and evaluation. A shared `AGENTS.md` base plus the platform template keeps code written by agents consistent across all 200 products.

## 6. Reference architecture

Every product is assembled from the same seven layers plus five cross-cutting services. A product team builds only its domain parts: its UI and MCP Apps, MCP server and Skills, harness logic, domain tools, product data and eval tasks. Everything else comes from the platform, built once and shared by all 200 products.

*(Diagram omitted in this export: reference architecture · 7 layers, cross-cutting services. The text around it and Appendix C carry the same rules.)*

Two products with different ideas differ only in the accented boxes, so a reviewer, an auditor or an on-call engineer meets the same structure everywhere.

- **ARCH-01** Products MUST use the platform service for every non-accented part. Building a private version needs a board waiver and a plan to contribute it back.
- **ARCH-02** Each layer MUST reach the layer below only through its platform interface: product code never calls a vendor model, a raw credential or an unregistered tool directly.
- **ARCH-03** Archetype patterns (section 3.1) ship as platform templates, so a new GEN or AGT product starts from working scaffolding rather than a blank repository.

**Shared platform services**

| Service | What it gives every product | Governing rules |
| --- | --- | --- |
| Model gateway | Tier routing, prompt caching, fallback, spend limits, vendor data terms | MODEL-01 to 07, OPS-05 |
| Harness runtime | Pattern templates, approval gates, budgets and stop rules, hand-off state, context reset | HAR-01 to 09 |
| Context services | Retrieval tools, cache-ordered context packer, memory store with schema and deletion | CTX-01 to 06 |
| Tool runtime | Tool registry, sandboxed execution, secrets vault, short-lived scoped credentials | SEC-03, HAR-07 |
| Eval service | CI suite runner, graders, pass^k reporting, live sampling, bulk runs for model upgrades | EVAL-01 to 10 |
| Observability | Tracing SDK, standard dashboard, alerting, redaction | OPS-01 to 09 |
| Guardrails | Untrusted-content isolation, output filters, prohibited-content list, content marking | SEC-02, SEC-08, UX-03 |
| Metering and billing | Usage metering, credits, caps, invoicing in Local and Export currencies | ECON-01 to 07 |
| AI UI kit | AI badge, approval card, action preview, progress tracker, citations, feedback, stop | UX-01 |
| Templates and registries | Repository scaffolding, shared `AGENTS.md`, MCP server template with the minimum tool contract, Skills registry | DOS-01, INT-01 to 08 |
| Audit log | Every action attributed to both the agent and the person it acts for | SEC-03 |

## 7. Engineering standards

Three standards govern how every product is engineered: how it reaches models, how its harness is built and how it manages context. They apply to all archetypes; where an archetype differs, the rule says so.

### 7.1 Model access and routing

- **MODEL-01** Products MUST call models only through the model gateway. Vendor SDKs in product code fail review.
- **MODEL-02** Every product MUST keep a routing table that assigns each step to a tier. **Small** (Flash, Haiku or Hydrogen class, or open weights) handles classification, extraction and simple turns. **Mid** handles most agent steps. **Frontier** handles orchestration, the hardest steps and evaluation.
- **MODEL-03** Release evals MUST pass on a primary model and a fallback from a different vendor, one of which MAY be open-weight.
- **MODEL-04** The effort or reasoning level SHOULD be set per step and recorded in the routing table. A higher model tier at lower effort can match a lower tier at maximum effort for less money, so test both.
- **MODEL-05** Prompts MUST be laid out for caching: system prompt, Skills and tool schemas first, then reference documents, then the changing turn. Cached input is billed at a 90 to 95% discount by major vendors.
- **MODEL-06** Models gated for dual-use capability (cyber, biology) MAY be used only by products the portfolio board has approved under R4.
- **MODEL-07** Approved models, prices and effort settings live in the volatile defaults register (section 15), never in this standard.

### 7.2 Harness design

The harness is everything around the model: the loop, the tools, the state, the checks and the stop rules. It is where most of a product's engineering effort goes.

- **HAR-01** Use the simplest pattern that passes the evals, in this order: single call, fixed pipeline, workflow with model steps, single agent with tools, multi-agent harness. Each step up MUST be justified in the harness design record with eval evidence.
- **HAR-02** Generation and evaluation MUST be separate roles. The evaluator checks output against the behaviour spec, ideally by exercising the real result (running the code, driving the app, checking the final state), and SHOULD run on a different model or prompt from the generator.
- **HAR-03** Work that outlasts one context window MUST hand off state through structured artifacts (progress file, task list, a written contract for each work unit) and MUST survive a full context reset. Compaction alone is not enough.
- **HAR-04** Every harness component MUST name, in the design record, the model weakness it compensates for. It is re-tested at each model upgrade and deleted if no longer needed (section 15).
- **HAR-05** Every run MUST have hard limits on steps, tokens, wall-clock time and spend, enforced by the platform rather than by the model.
- **HAR-06** Anything deterministic (arithmetic, formatting, business rules, routing logic) MUST be done in code, not by the model.
- **HAR-07** Tool calls MUST be idempotent or carry an idempotency key. The stateless MCP specification no longer resumes broken streams, so a retry must be safe.
- **HAR-08** Irreversible or external actions MUST pass through the platform approval service according to the product's autonomy level (section 3.2).
- **HAR-09** CNV products MUST split a fast conversational layer from a slower reasoning layer, the default architecture for voice agents since 2026.

### 7.3 Context, data and memory

- **CTX-01** Retrieval SHOULD be offered to the model as tools (search, fetch, MCP resources) rather than pre-stuffed into the prompt. EXT and MON pipelines MAY use a fixed retrieval step when that is simpler.
- **CTX-02** Each step MUST have a context budget. Models accept about 1M tokens, but cost and attention quality degrade as volume grows, so a full window is a defect, not a default.
- **CTX-03** Procedural know-how MUST live in versioned Skills (section 13), not in growing system prompts.
- **CTX-04** Data access MUST be enforced at retrieval time with the end user's identity. An agent never sees more than the person it acts for.
- **CTX-05** Memory MUST have a written schema: what is stored, why, for how long, who can see it, and how a user deletes it. Memory written from untrusted content is quarantined until checked (memory poisoning, section 10).
- **CTX-06** Customization follows a ladder: context, then Skills, then retrieval, then fine-tuning or reinforcement fine-tuning. Fine-tuning is reserved for narrow, high-volume tasks where evals prove it beats the cheaper rungs.

## 8. Evaluation and quality

No product passes a gate on a demo. Every release decision rests on the product's eval suite, built the same way across all 200 products. The suite starts from real examples in Stage 1 and grows from production failures for as long as the product lives.

### 8.1 Suite structure

| Set | Purpose | Starts | Expected result |
| --- | --- | --- | --- |
| Capability | Hard tasks that measure progress | Stage 1, from 20 to 50 real examples | Starts low and rises |
| Regression | Tasks the product has mastered, graduated from the capability set | Stage 2 | Near 100%; any drop blocks release |
| Safety | Injection, harmful requests, policy breaches, data leakage | Stage 2: platform suite plus product-specific attacks | Zero critical failures |
| Held-out | At least 200 items never used during development, scored against the human baseline | Stage 2 | At or above the human baseline (idea scorecard C2) |

Cost and latency are recorded on every run of every set, so quality and unit cost are always read together.

### 8.2 Rules

- **EVAL-01** A seed set of 20 to 50 tasks, drawn from real examples or real failures, MUST exist before G1.
- **EVAL-02** Graders MUST check outcomes, not paths. Checking for a fixed sequence of tool calls makes tests brittle and punishes valid solutions.
- **EVAL-03** Use deterministic checks first, model graders with a written rubric where judgement is needed, and people for calibration and for R3 products. Model graders MUST be re-calibrated against human labels whenever the grading model changes.
- **EVAL-04** Report pass@1 for quality and pass^k for consistency. pass^k is the share of tasks that succeed in all k trials, which is what a repeat user experiences: at 75% per-trial success, three in a row happens only about 42% of the time.
- **EVAL-05** The human baseline (accuracy, critical-error rate, time per item) MUST be measured in Stage 1, and every release is compared with it.
- **EVAL-06** Every change to a prompt, Skill, tool, model, harness or retrieval setting MUST run the regression and safety sets in CI. A regression blocks the merge.
- **EVAL-07** A named person MUST read transcripts every week, in the volume set in section 3.4. Scores are not trusted until someone has read the transcripts behind them: in one published case, grading bugs held a model at 42% on a benchmark where it actually scored 95%.
- **EVAL-08** Every production incident and user-reported failure MUST become a regression task within 5 business days.
- **EVAL-09** A sample of live traffic MUST be graded continuously by the same graders. A drop past the alert threshold pages the on-call.
- **EVAL-10** Results MUST be stored with the model, harness version, cost and date, so any two releases can be compared.

### 8.3 Release thresholds by autonomy level

These are defaults on the core task set, which the portfolio board may raise. To be promoted one level, a product must hold the next level's threshold on live traffic for 30 consecutive days.

| Level | Consistency measure | Threshold on core tasks | Also required |
| --- | --- | --- | --- |
| A0 Assist | pass@1 | Above the target set at G1 against the human baseline | Zero critical safety failures |
| A1 Draft and approve | pass@1 and edit rate | At least 70% of outputs accepted unedited or with minor edits (idea scorecard E3) | Zero critical safety failures |
| A2 Act within bounds | pass^3 | At least 85% | Every irreversible action gated |
| A3 Act and report | pass^5 | At least 90% | Critical-error rate at or below the human baseline (idea scorecard C3) |
| A4 Autonomous | pass^5 plus 10 or more full long-horizon runs | At least 95% | Independent audit of long runs |

## 9. Operations and observability

Every product is traced, monitored and run the same way, so the on-call engineer for one product can read any other product's dashboard without training. Observability is platform-supplied; products add only their own task definitions and SLO targets.

- **OPS-01** Every model call, tool call, retrieval, approval and hand-off MUST be traced under one trace ID per task, through the platform SDK. The SDK follows the OpenTelemetry GenAI semantic conventions, which were still at Development status in November 2026, and absorbs renamed attributes so products do not have to.
- **OPS-02** Every product MUST publish the standard dashboard below, with no panels removed.
- **OPS-03** SLO targets MUST be set at G3 for the SLO types of the product's archetype.
- **OPS-04** Every product MUST be able to drop to a safe mode (suggestions only, or hand-off to a person) or stop within 5 minutes through a platform flag. A3, A4 and R3 products drill this every quarter.
- **OPS-05** The gateway MUST fail over to the eval-qualified fallback model (MODEL-03) automatically when a vendor degrades.
- **OPS-06** Spend caps MUST exist per task and per customer per day, with an alert when cost per successful task exceeds twice its trailing 7-day average.
- **OPS-07** Feedback (ratings, edits, overrides, escalations) MUST be captured, linked to its trace and fed into the eval datasets.
- **OPS-08** Every Sev 1 or Sev 2 incident MUST get a postmortem within 5 business days and a regression task (EVAL-08).
- **OPS-09** The SDK MUST redact or tokenize personal data and secrets in traces. Retention follows the risk tier and the jurisdiction register (section 10).

**Standard dashboard**

| Panel | Measures |
| --- | --- |
| Volume | Tasks per day, by customer and task type |
| Quality | Online eval pass rate, pass^k on sampled tasks |
| Cost | Cost per successful task, cache-hit rate, model mix |
| Speed | p50 and p95 latency per step and per task |
| Human load | Approval, override and escalation rates; review minutes per task |
| Safety | Flagged outputs, blocked injections, policy hits |
| Reliability | Error rate, fallback activations, budget-limit stops |

**SLO types by archetype**

| Archetype | SLO types |
| --- | --- |
| GEN | Time to first draft; acceptance rate |
| EXT | Throughput per hour; field accuracy on the online sample |
| ANS | p95 time to answer; resolution rate |
| AGT | Task completion time; task success; stuck-task rate |
| CNV | p95 response latency; call goal completion |
| MON | Detection delay; precision at target recall |

**AI incident classes**

| Class | Example | Default severity |
| --- | --- | --- |
| Wrong action | Agent sends, pays or deletes in error | Sev 1 |
| Data exposure | Personal data or secrets appear in output or logs | Sev 1 |
| Hijack | Injected content changes agent behaviour | Sev 1 |
| Harmful or false output | A wrong figure reaches a customer | Sev 2 (Sev 1 for R3) |
| Runaway cost | Spend passes a cap, or an agent loops | Sev 2 |
| Quality drift | Online evals fall below threshold | Sev 3 |

## 10. Security, safety and compliance

Every product is built on the assumption that it will be attacked through the content it reads. Prompt injection is still the top risk (LLM01 in the OWASP Top 10 for LLM Applications 2026), and agents amplify it because they hold tools: Agent Goal Hijacking ranks first in the OWASP Top 10 for Agentic Applications (December 2025).

### 10.1 Security rules

- **SEC-01** Every product MUST have a threat model built against both OWASP lists, at the depth set in section 3.4.
- **SEC-02** Untrusted content (web pages, email, documents, tickets, code comments, results from outside systems) is data, never instructions. A step that reads it MUST NOT hold privileged tools in the same context. It passes validated, structured output to a privileged step, or every privileged action needs approval. In April 2026, crafted GitHub comments hijacked coding agents from three vendors running in CI and leaked their API keys.
- **SEC-03** Credentials MUST be scoped per task, short-lived and held by the platform vault. Secrets never enter model context. Agents act under their own identity, linked to the person they act for, so every action can be traced to both.
- **SEC-04** Third-party Skills and MCP servers MUST come from the internal registry, pinned by version and hash, reviewed before admission and run sandboxed. A January 2026 study of 31,132 public Skills found 26.1% had at least one vulnerability and 5.2% showed signs of malicious intent.
- **SEC-05** Memory written from untrusted content MUST be quarantined until checked (CTX-05). Memory poisoning is ASI06 on the OWASP agentic list.
- **SEC-06** Actions that pay, send, publish, delete or change permissions MUST pass the approval gate set by the product's autonomy level (HAR-08).
- **SEC-07** Each model's data terms MUST be recorded in the routing table: zero data retention where offered, and any vendor retention for safety monitoring (some frontier tiers keep data for 30 days when a customer is not eligible for zero retention).
- **SEC-08** Consumer-facing products MUST filter output against the platform's prohibited-content list, which includes non-consensual intimate imagery and child sexual abuse material.

### 10.2 Jurisdiction register

Each product lists the markets it serves in its manifest, and the risk reviewer maps obligations from this central register. The rows follow the idea scorecard's two market calibrations. This register summarizes obligations for planning; it is not legal advice, and counsel confirms each R3 product.

| Market | Main obligations to map | Products affected |
| --- | --- | --- |
| Nigeria and West Africa (Local) | NDPA 2023 and GAID 2025: registration, data protection officer, audit returns | Any product processing personal data of people in Nigeria |
| European Union (Export) | GDPR; EU AI Act (timeline below) | Products placed on the EU market or whose output is used there |
| United Kingdom (Export) | UK GDPR; buyer security reviews | Products sold to UK customers |
| United States (Export) | Buyer security expectations (often SOC 2 at mid-market); HIPAA for health data, a knockout for Solo builders under the idea scorecard | Products sold to US customers |

### 10.3 EU AI Act timeline

Dates follow the Digital Omnibus amendment (Regulation (EU) 2026/1744, in force 27 July 2026).

| Obligation | Applies from | Products affected | What this framework requires |
| --- | --- | --- | --- |
| Transparency (Article 50): disclose AI interaction, label deepfakes and synthetic content | 2 August 2026; grace to 2 December 2026 for marking content from systems already on the market | Every ANS and CNV product, and GEN products making media for the public | Disclosure (UX-03) and platform content marking |
| Prohibition on systems generating non-consensual intimate imagery or child sexual abuse material | Added by the Omnibus | Every GEN product | SEC-08 |
| High-risk systems in Annex III areas (hiring, credit, education, biometrics and similar) | 2 December 2027 | R3 products in those areas | Inventory and classification now; compliance file at G2 |
| High-risk AI embedded in regulated products (Annex I) | 2 August 2028 | Products built into regulated devices | Portfolio board review before G1 |
| General-purpose model obligations | 2 August 2025; Commission fining powers from 2 August 2026 | Only products that train and release their own general-purpose models | Flag to the board at G0 |

Using an agent for a high-risk purpose its provider did not intend can make you the provider in law. Any change of intended purpose MUST re-run classification (section 3).

## 11. Experience standard

All 200 products share one interaction grammar: the same patterns for approvals, progress, sources and disclosure, drawn from a shared AI UI kit. A user who has learned one product can operate the next, and a designer can review any product against the same patterns.

**Core surface by autonomy level**

| Level | Core surface | The user sees | The user can |
| --- | --- | --- | --- |
| A0 | Inline suggestion | A suggestion marked as AI | Accept, edit, dismiss |
| A1 | Draft review | The full draft, a diff against the source or last version, its sources | Approve, edit, reject with a reason |
| A2 | Action preview | What will happen, to what, and whether it can be undone | Confirm irreversible actions; undo reversible ones |
| A3 | Delegation workspace | Task list, live progress, artifacts produced, exceptions | Stop, redirect, review samples, clear the exception queue |
| A4 | Goal dashboard | Goals, outcomes, spend, audit trail | Set goals and limits, audit, pause |

**Rules**

- **UX-01** Every product MUST use the shared AI UI kit for the AI badge, approval card, action preview, progress tracker, source citation, needs-review flag, feedback control and stop button.
- **UX-02** Results MUST be shown as reviewable artifacts, diffs or final-state summaries, never a bare "done". Agents over-report success.
- **UX-03** People MUST be told when they are dealing with AI, and synthetic media MUST be labelled (EU AI Act Article 50).
- **UX-04** ANS products MUST cite sources and say when they do not know. Low confidence routes to a person.
- **UX-05** There MUST always be a way out: hand-off to a person, undo for reversible actions, stop for running agents.
- **UX-06** Long-running work SHOULD use a delegation surface (assign, monitor, review) rather than a chat thread, which is how leading agent products are organized in 2026.
- **UX-07** Latency MUST be designed for: stream output and show progress for anything longer than a few seconds. Products MAY sell a faster tier where speed matters; vendors now charge about twice the price for about twice the speed.
- **UX-08** CNV products MUST handle interruption and backchannel, and MUST state they are AI at the start of the call.
- **UX-09** Every surface MUST capture feedback in one action (OPS-07).
- **UX-10** UI that should appear inside other agents MUST ship as an MCP App (section 13).

## 12. Economics and pricing

Every product is measured on cost per successful task and gross margin from Stage 1, against the idea scorecard's floors: at least 60% gross margin at G3, and a kill below 40% with no credible path up (F1, KO10). AI products typically run at 50 to 60% gross margin against 80 to 90% for SaaS, because every request costs compute. Margin has to be engineered.

```latex
\text{Cost per successful task} = \frac{\text{model} + \text{tools} + \text{infrastructure} + \text{human review}}{\text{tasks that succeeded}}
```

**Rules**

- **ECON-01** Products MUST track cost per successful task, including human review time, rather than price per token. A verbose model can cost more per task than one with a higher list price.
- **ECON-02** Margin evidence by gate: at G2, a credible path to 60%; at G3, at least 60% measured at pilot volume, with variable cost at or under 20% of unit price (idea scorecard F2).
- **ECON-03** Before any price rise, apply the cost levers in this order: raise cache hits through prompt layout (MODEL-05); route each step to the smallest tier that passes evals; tune effort per step; batch or run off-peak where latency allows; cut output and context per step; delete harness parts the model no longer needs.
- **ECON-04** Every pricing plan MUST be stress-tested against the 95th-percentile customer, because heavy users push agents into ever-longer tasks.
- **ECON-05** Every plan MUST include per-customer usage limits (OPS-06).
- **ECON-06** Unit economics MUST be recomputed at every routing change and vendor price change. Launch prices are not guaranteed: at least one frontier model shipped in 2026 with an introductory price scheduled to double.
- **ECON-07** The pricing model MUST be chosen from the table below; price level and currency follow the idea scorecard's market calibration (for example, Local plans priced in naira with a quarterly review).

**Choosing a pricing model**

| Pricing model | Use when | Fits | Watch out for |
| --- | --- | --- | --- |
| Hybrid: base plan, included credits, metered overage (default) | Usage varies across customers | All archetypes | Credits users cannot predict; publish a usage calculator |
| Outcome-based | The outcome is countable, attributable and hard to dispute | ANS (resolved conversations), some AGT | Disputes over what counts; Datadog moved away from per-investigation pricing |
| Per unit of work | Units are uniform | EXT (per document), MON (per entity) | Cost swings with input size |
| Per minute | Real-time voice | CNV | Idle time on open calls |
| Per seat | Usage is light and predictable | A0 assistants | A few heavy users erase the margin |
| Speed add-on | Latency has clear value to the buyer | Any | Fast modes cost about twice as much to serve |

Reference prices from the market: Intercom Fin charges $0.99 and HubSpot $0.50 per resolved conversation; Salesforce charges $0.10 per agent action; GitHub Copilot moved to token-metered credits on 1 June 2026. Credits are spreading fastest, and survey estimates of outcome-based pricing range from 3.8% to 23% of AI companies.

## 13. Interoperability and distribution

Every product ships two agent-facing interfaces beside its own UI: an MCP server for its capabilities and a set of Skills for its know-how. Any agent client can then use the product, and the 200 products can call each other. Both are now neutral standards: MCP moved to the Linux Foundation's Agentic AI Foundation on 9 December 2025, and Agent Skills became an open standard on 18 December 2025, since adopted by OpenAI, Google and Microsoft.

**Rules**

- **INT-01** Every product MUST expose its core capabilities as an MCP server built from the platform template, to the current stateless specification (2026-07-28 at the time of writing). Requests carry their own protocol version, client identity and capabilities, with no session handshake.
- **INT-02** Every product MUST package its domain know-how as Agent Skills: a folder with a `SKILL.md` (name, description, instructions) and optional scripts. Keep the body under 5,000 tokens. Agents read only the short description until a task matches, so it must say exactly when to use the Skill.
- **INT-03** Tool and Skill selection MUST be in the eval suite: evals check that an agent picks the right tool or Skill from its description alone.
- **INT-04** Product-to-product calls inside the portfolio MUST go through MCP, never private APIs. Agent-to-agent delegation MAY use A2A, also governed by the Linux Foundation.
- **INT-05** UI meant to render inside other agents MUST ship as an MCP App. New products MUST NOT use features the specification deprecated (Roots, Sampling, Logging, the HTTP+SSE transport, OAuth Dynamic Client Registration).
- **INT-06** Interfaces MUST be versioned semantically; breaking changes need 90 days' notice to consuming products.
- **INT-07** Every server and Skill MUST be published to the internal registry. Export products SHOULD also list in the public directories of major agent clients, as agent-native distribution becomes a sales channel.
- **INT-08** Every MCP server MUST apply per-caller scoped authorization, rate limits and audit logging, and MUST keep secrets out of tool output (SEC-03).

**Minimum tool contract**

Every product's MCP server offers these four tools, with the same names and behaviour, in addition to its domain tools. Long tasks use the MCP Tasks extension.

| Tool | Purpose |
| --- | --- |
| `run` | Start a task with the product's input schema; returns a task ID |
| `status` | Progress, steps taken, approvals waiting |
| `result` | Artifacts and a final-state summary |
| `feedback` | Rate or correct a result; feeds the eval datasets (OPS-07) |

## 14. Portfolio governance

Two hundred ideas are run as a funnel, not as 200 parallel builds. All are screened cheaply, and only those that clear a gate earn the next stage's time and money. Most ideas should stop at G0 or G1; a high early kill rate means the framework is working.

### 14.1 Teams

| Team | Owns |
| --- | --- |
| Portfolio board | Gate decisions at G3 and for every R3 product; waivers; funding; this spec |
| Platform team | Model gateway, harness runtime, eval service, observability, security services, UI kit, templates, registries |
| Product pods | One or more products end to end: product owner, AI engineer, eval owner; designer shared across pods |
| Risk and compliance reviewers | Threat models, compliance files, sign-off for R2 and R3 |
| Enablement | Shared `AGENTS.md`, templates, training, dossier quality checks |

- **GOV-01** From Stage 3 on, every product MUST have a named product owner, engineering lead, eval owner and on-call rotation. Before Stage 3, one pod may carry several products.
- **GOV-02** When three or more products build the same component, the platform team MUST absorb it (principle 9).

### 14.2 Throughput and cohorts

- **Screen everything first.** All 200 ideas go through the Stage 0 desk screen, about 30 minutes each, or roughly 100 hours in total.
- **Run later stages in cohorts sized to capacity.** Per the idea scorecard, a Solo builder runs Stage 1 on 5 to 8 ideas at once and Stage 3 on one; a funded team of 3 to 8 runs 10 to 15 and two. Multiply by the number of pods.
- **Start with products that harden the platform.** The first cohort SHOULD favour R1 and R2 products of the EXT, ANS and GEN archetypes, so the gateway, eval service and UI kit are proven before A3 agents and R3 domains arrive.
- **GOV-03** Each pod MUST respect work-in-progress limits per stage, set by the board from these capacities.

### 14.3 Cadence

| Rhythm | Who | What |
| --- | --- | --- |
| Weekly | Each pod | Transcript reading, eval results, cost per successful task |
| Every two weeks | Gate panel | Gate reviews in batches, from dossiers only |
| Monthly | Portfolio board | Portfolio metrics, waivers, kills, autonomy promotions |
| Quarterly | Board and platform team | Model and vendor review, volatile register refresh, spec update, kill-switch drills |

### 14.4 Portfolio metrics

Every product reports the same metrics, read from its manifest and dashboard, so the board compares products like for like.

| Metric | Definition |
| --- | --- |
| Stage distribution | Products at each stage, and time in stage |
| Gate yield | Share passing each gate at the first attempt |
| Kill and park rate | By gate and by reason |
| Quality | pass^k on core tasks against the autonomy threshold |
| Cost per successful task | Trend, and ratio to price |
| Gross margin | Per product, and revenue-weighted across the portfolio |
| Autonomy mix | Products at each level; promotions and demotions |
| Model portability | Share of products with a qualified fallback from a second vendor |
| Incidents | Sev 1 and Sev 2 per quarter; days to regression task |
| Value | Revenue, or hours saved for internal products |

### 14.5 Decision rules

- **GOV-04** A product that misses a stage's timebox gets one extension of half the timebox. If it misses again, it is parked, and reopens only with new evidence at E3 or above on the idea scorecard.
- **GOV-05** Autonomy promotion is proposed by the pod and needs the next level's threshold held on live traffic for 30 days (section 8.3). The risk reviewer approves for R2, the board for R3. A Sev 1 wrong-action or hijack incident demotes the product one level automatically until its postmortem closes.
- **GOV-06** A product in production goes to sunset review if gross margin stays below 40% for two consecutive months with no fix plan, quality stays below threshold for 30 days, Sev 1 incidents repeat, or its value metric falls for two quarters.

## 15. Change management

Models, prices and protocols change monthly, so the framework separates durable rules (sections 1 to 14) from volatile values (the register below) and gives every product the same upgrade routine. About half a dozen frontier releases landed in November 2026 alone; handled product by product, that churn would swamp 200 teams.

### 15.1 Model upgrade protocol

The platform team runs steps 1 to 3 automatically for every product; pods run steps 4 to 6.

1. **Register.** The platform adds a new model to the gateway in shadow mode within 5 business days of its release, for frontier and mid tiers.
2. **Bulk evaluation.** Every product's regression, held-out and safety sets run against the candidate, and results land in each dossier.
3. **Compare.** Quality (pass@1 and pass^k), cost per successful task and latency are compared with the current model.
4. **Harness review.** Each component in the harness design record is tested with it removed. Components the new model no longer needs are deleted (HAR-04).
5. **Canary.** Traffic moves 5%, then 25%, then 100%, with online evals and automatic rollback on any threshold breach.
6. **Record.** The change log gets the eval deltas, cost change and components removed.

### 15.2 Volatile defaults register

Values as of 25 November 2026. Model names are candidates to evaluate, not endorsements; every product still qualifies its own choices through evals. Figures marked as tracker estimates should be checked on vendor pages before purchase decisions.

| Parameter | Current value | Review |
| --- | --- | --- |
| Frontier tier candidates | Claude Fable 5.2 ($8 / $40 per M tokens); GPT-6.2 Astra; Gemini 4 Carbon (introductory $2 / $10, rising to $4 / $20) | Monthly |
| Mid tier candidates | Claude Opus 5.5 and Sonnet 5.5; Gemini 4 Argon; GPT-6.2 Sol | Monthly |
| Small tier candidates | Claude Haiku 5.5; Gemini 4 Hydrogen ($1.50 / $7.50, tracker estimate); DeepSeek V4.1-Flash ($0.30 / $1.20 at peak) | Monthly |
| Open-weight fallbacks | DeepSeek V4 Pro and Flash (MIT licence); Meta Muse Glimmer (Apache 2.0) and Muse Spark Open; verify each licence before use | Monthly |
| Gated models (R4 only) | Claude Mythos 5.2; GPT-6 Cyber; Gemini 4 Carbon through its vetted-defender programme | Quarterly |
| Scheduled retirements | OpenAI legacy gpt-realtime models shut down on 20 January 2027 (affects CNV products) | Monthly |
| Cached-input discount | 90% (GPT-6 Astra) to 95% (Gemini 4 Carbon) | On price change |
| Fast-mode premium | About 2x price for 2x speed; Fable 5.2 fast mode $16 / $80 for up to 2.5x | On price change |
| MCP specification | 2026-07-28, stateless | On each release |
| Telemetry conventions | OpenTelemetry GenAI, Development status | Quarterly |
| EU AI Act dates | Article 50 marking grace ends 2 December 2026; Annex III 2 December 2027; Annex I 2 August 2028 | Quarterly |
| Release thresholds and margin floors | Sections 8.3 and 12 | After 3 to 5 products reach Stage 3, then quarterly |

### 15.3 Versioning this spec

- **SPEC-01** The spec uses semantic versions: major for a new MUST that existing products must adopt, minor for a new SHOULD or clarification, patch for register updates.
- **SPEC-02** Changes are proposed in writing and decided at the monthly board review.
- **SPEC-03** A new MUST applies at each product's next gate, or within 180 days for products already in production.
- **SPEC-04** The register is refreshed monthly as a patch release and needs no board vote unless a value moves a threshold.

## Appendices

### A. Product Card template

```markdown
# <Product name> · <product-id>
Code: <ARCH-An-Rn> · Market: Local | Export · Builder: Solo | Funded · Stage: <0-5>
Owner: <name> · Pod: <pod>

## Problem
Who has it, how often, and what it costs today (hours, money, errors).

## Buyer and user
The budget owner who signs; the daily user; anyone else affected.

## What the product does
One paragraph. Primary archetype and any secondary jobs.

## Autonomy
Launch level, target level, and the evidence that would justify promotion.

## Success metric
The archetype's north-star metric, the human baseline, the target.

## Unit economics (estimate)
Pricing unit, expected cost per successful task, expected gross margin.

## Risks
Why this risk tier; main threats; regulated areas touched.

## Kill criteria
The results that would stop this product, gate by gate.
```

### B. Manifest example

```yaml
id: P-042
name: Invoice capture
code: EXT-A1-R2
secondary_archetypes: [ANS]
stage: 3
markets: [local, export]
builder_profile: funded
owners: {product: <name>, engineering: <name>, eval: <name>}
autonomy: {current: A1, target: A2}
routing_table: harness/routing.yaml
fallback_qualified: true
evals:
  core_metric: accepted_with_minor_edits
  threshold: 0.70
  last_run: <date>
slos: ops/slos.yaml
pricing: {model: per_unit, unit: document}
economics: {cost_per_successful_task: <measured>, gross_margin: <measured>}
interfaces: {mcp: mcp/server.yaml, skills: [invoice-coding]}
jurisdictions: [NG, EU]
spec_version: 1.0
```

### C. Gate checklists

Business evidence comes from the idea scorecard; build evidence from this framework. Both columns must clear.

| Gate | Business evidence | Build evidence | Signs off |
| --- | --- | --- | --- |
| G0 Worth discovering | No knockout; quick screen at least 30/50; S0-1, S0-3, S0-4 and S0-8 each at least 1; no more than one unknown | Code assigned; Product Card and manifest created; R4 ideas referred to the board | Pod lead (board for R4) |
| G1 Worth prototyping | Stage score at least 65; A5 at least 40% with n of 15 or more; at least half of interviewees show current spend or a workaround | Seed eval set of 20 to 50 real examples; human baseline measured; feasibility spike on two models; data and context map; threat model for R3 | Pod lead and platform reviewer (risk reviewer for R3) |
| G2 Worth piloting | Stage score at least 70; at least 3 LOIs and 1 deposit or paid pilot; value-to-price at least 5x Export or 8x Local | Built from the template; at least 200 held-out items at or above baseline; zero critical safety failures; design record and routing table; fallback model passes; threat model for R2; path to 60% margin; compliance file for R3 | Gate panel (risk reviewer for R2, board for R3) |
| G3 Go or no-go | Success criterion met in at least 2 pilots; pilot-to-paid at least 60% with 2 or more conversions; gross margin at least 60%; stage score at least 75 | Autonomy threshold met (section 8.3); dashboard and SLOs live; kill switch tested; MCP server and Skills published; runbook; compliance file for R2; external red team for R3 | Portfolio board |

### D. Glossary

| Term | Meaning in this spec |
| --- | --- |
| Archetype | What a product does: GEN, EXT, ANS, AGT, CNV or MON (section 3.1) |
| Autonomy level | What a product may do without a person, A0 to A4 (section 3.2) |
| Risk tier | What happens if it is wrong, R1 to R4 (section 3.3) |
| Harness | Everything around the model: loop, tools, state, checks, stop rules |
| Context engineering | Deciding what goes into the model's context, when to compact or reset, and how state passes between sessions |
| pass@1 / pass^k | Success on one try / success on all k tries of the same task |
| Human baseline | Accuracy, critical-error rate and time per item of the people who do the task today |
| Cost per successful task | All variable cost, human review included, divided by tasks that succeeded |
| Model gateway | The one platform service through which products reach models |
| MCP | Model Context Protocol, the standard way agents call a product's tools |
| MCP App | Interactive UI served from an MCP server into another agent |
| Agent Skill | A folder with a `SKILL.md` that packages procedural know-how for any agent |
| Volatile defaults register | The table of fast-changing values kept out of the rules (section 15.2) |

### E. Research basis

This spec draws on the research report of 25 November 2026 earlier in this conversation and on the idea scorecard's thresholds and calibrations. Figures are as reported there; the main sources were:

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) (9 January 2026)
- [Anthropic Engineering](https://www.anthropic.com/engineering): long-running harness and agent memory posts
- [Menlo Ventures: 2025 State of Generative AI in the Enterprise](https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/)
- [LangChain: State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering)
- [Gartner: uniform governance across AI agents](https://www.gartner.com/en/newsroom/press-releases/2026-05-26-gartner-says-applying-uniform-governance-across-ai-agents-will-lead-to-enterprise-ai-agent-failure) (26 May 2026)
- [Anthropic: donating MCP and the Agentic AI Foundation](https://anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation)
- [WorkOS: the stateless MCP specification 2026-07-28](https://workos.com/blog/mcp-stateless-spec-2026-07-28)
- [Jisc: Agent Skills, the emerging standard](https://nationalcentreforai.jiscinvolve.org/wp/2026/10/28/agent-skills-the-emerging-standard-and-how-it-relates-to-ai-skills/)
- Liu et al., Agent Skills in the Wild (arXiv:2601.10338)
- OWASP Top 10 for Agentic Applications (December 2025) and OWASP Top 10 for LLM Applications 2026
- [Stanford AI Index 2026 takeaways](https://c3.unu.edu/blog/2026-stanford-ai-index-report-takeaways)
- [Growth Unhinged: State of B2B monetization in 2026](https://www.growthunhinged.com/p/the-state-of-b2b-monetization-in-2026) and [The credit is the new seat](https://falkster.com/blog/the-credit-is-the-new-seat)
- [Computerworld: Claude Fable 5.2 and Mythos 5.2](https://www.computerworld.com/article/4246693/anthropic-unveils-claude-fable-5-2-mythos-5-2-with-coding-gains-and-lower-prices-2.html), [SiliconANGLE: GPT-6.2 Astra and Sol](https://siliconangle.com/2026/11/17/openai-rolls-out-gpt-6-2-astra-for-professional-work-and-gpt-6-2-sol-for-everyday-work/), [Google: Gemini 4 Carbon](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/), [Artificial Analysis: DeepSeek V4](https://artificialanalysis.ai/articles/deepseek-is-back-among-the-leading-open-weights-models-with-v4-pro-and-v4-flash)
- [Technology.org: EU AI Act deadlines after the Digital Omnibus](https://www.technology.org/2026/10/13/eu-ai-act-deadlines-after-the-digital-omnibus-what-applies-from-december-2026-to-august-2028/) and [Gibson Dunn: Omnibus agreement](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/)
- [OpenTelemetry GenAI semantic conventions explained](https://lowob.com/research/opentelemetry-genai-semantic-conventions-explained/)
