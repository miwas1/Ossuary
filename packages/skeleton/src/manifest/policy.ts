// The code resolver (framework §3, plan §5). The three tables are data; resolvePolicy reads only
// them and its arguments, so equal inputs always give equal, frozen policies.
import { PolicyError } from "../errors.ts";
import { deepFreeze } from "../freeze.ts";

export type Archetype = "GEN" | "EXT" | "ANS" | "AGT" | "CNV" | "MON";
export type Autonomy = "A0" | "A1" | "A2" | "A3" | "A4";
export type Risk = "R1" | "R2" | "R3" | "R4";
export type Pattern = "pipeline" | "generate-evaluate" | "realtime-split" | "retrieval-answer" | "planner-executor";
export type Approval = "forbidden" | "approve" | "auto-with-undo" | "auto"; // D-42
export type Measure = "pass@1" | "accept-rate" | "pass^3" | "pass^5";

export const ARCHETYPES = {
  GEN: { pattern: "generate-evaluate", thresholded: false, grader: "Rubric grader", pricingUnit: "Credits per output", northStar: "Share of outputs accepted without major edits", steering: [], built: true },
  EXT: { pattern: "pipeline", thresholded: false, grader: "Field comparison against a gold set", pricingUnit: "Per document", northStar: "Field accuracy against the human baseline", steering: ["archetype-ext.md"], built: true },
  ANS: { pattern: "retrieval-answer", thresholded: false, grader: "Correctness and groundedness", pricingUnit: "Per resolution", northStar: "Resolved without escalation", steering: [], built: false },
  AGT: { pattern: "planner-executor", thresholded: false, grader: "Final-state check in a sandbox", pricingUnit: "Per completed task", northStar: "Task success at pass^k", steering: [], built: false },
  CNV: { pattern: "realtime-split", thresholded: false, grader: "Simulated conversations plus latency", pricingUnit: "Per minute", northStar: "Goal completion within the latency target", steering: ["archetype-cnv.md"], built: false },
  MON: { pattern: "pipeline", thresholded: true, grader: "Precision and recall on labelled events", pricingUnit: "Per monitored entity per month", northStar: "Precision at the target recall", steering: [], built: false },
} as const satisfies Record<Archetype, { pattern: Pattern; thresholded: boolean; grader: string; pricingUnit: string; northStar: string; steering: readonly string[]; built: boolean }>;

export const AUTONOMY = {
  A0: { reversible: "forbidden", irreversible: "forbidden", measure: "pass@1", threshold: 0, targetRequired: true, longRuns: 0 },
  A1: { reversible: "approve", irreversible: "approve", measure: "accept-rate", threshold: 0.7, targetRequired: false, longRuns: 0 },
  A2: { reversible: "auto-with-undo", irreversible: "approve", measure: "pass^3", threshold: 0.85, targetRequired: false, longRuns: 0 },
  A3: { reversible: "auto-with-undo", irreversible: "auto", measure: "pass^5", threshold: 0.9, targetRequired: false, longRuns: 0 },
  A4: { reversible: "auto-with-undo", irreversible: "auto", measure: "pass^5", threshold: 0.95, targetRequired: false, longRuns: 10 },
} as const satisfies Record<Autonomy, { reversible: Approval; irreversible: Approval; measure: Measure; threshold: number; targetRequired: boolean; longRuns: number }>;

export const RISK = {
  R1: { sets: ["standard"], requireThreatModel: false, privacyNote: false, expertLabels: "none", fairness: false, reviewSample: "weekly-20", traceRedaction: true },
  R2: { sets: ["standard", "app-attacks"], requireThreatModel: true, privacyNote: true, expertLabels: "critical", fairness: false, reviewSample: "weekly-50", traceRedaction: true },
  R3: { sets: ["standard", "app-attacks"], requireThreatModel: true, privacyNote: true, expertLabels: "all", fairness: true, reviewSample: "daily", traceRedaction: true },
} as const;

export interface Policy {
  code: string;
  archetype: Archetype;
  autonomy: Autonomy;
  risk: Exclude<Risk, "R4">;
  pattern: Pattern;
  thresholded: boolean;
  grader: string;
  pricingUnit: string;
  northStar: string;
  steering: readonly string[];
  approval: { reversible: Approval; irreversible: Approval };
  release: { measure: Measure; threshold: number; targetRequired: boolean; longRuns: number };
  safety: {
    sets: readonly string[];
    requireThreatModel: boolean;
    privacyNote: boolean;
    expertLabels: "none" | "critical" | "all";
    fairness: boolean;
    reviewSample: "weekly-20" | "weekly-50" | "daily";
    traceRedaction: true;
  };
}

export interface ReleaseOverride {
  threshold?: number | undefined;
  measure?: string | undefined;
}

function isKey<T extends object>(table: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(table, key);
}

/** Resolve a three-part code into a frozen Policy. Overrides may raise the threshold, never lower it (framework §3.4). */
export function resolvePolicy(code: string, override?: ReleaseOverride): Readonly<Policy> {
  const parts = code.split("-");
  if (parts.length !== 3) throw new PolicyError("invalid", "code", `code "${code}" must be <archetype>-<autonomy>-<risk>, for example GEN-A1-R1`);
  const [a, l, r] = parts as [string, string, string];
  if (!isKey(ARCHETYPES, a)) throw new PolicyError("invalid", "archetype", `code "${code}": unknown archetype "${a}" (use ${Object.keys(ARCHETYPES).join(", ")})`);
  if (!isKey(AUTONOMY, l)) throw new PolicyError("invalid", "autonomy", `code "${code}": unknown autonomy level "${l}" (use A0 to A4)`);
  if (r === "R4") throw new PolicyError("restricted", "risk", `code "${code}": R4 products are restricted and are not loaded (framework §3.3)`);
  if (!isKey(RISK, r)) throw new PolicyError("invalid", "risk", `code "${code}": unknown risk tier "${r}" (use R1 to R3)`);

  const arch = ARCHETYPES[a];
  const auto = AUTONOMY[l];
  const risk = RISK[r];
  let threshold: number = auto.threshold;

  if (override?.measure !== undefined && override.measure !== auto.measure) {
    throw new PolicyError("override", "release.measure", `code "${code}": the release measure for ${l} is ${auto.measure} and can't be overridden (got "${override.measure}")`);
  }
  if (override?.threshold !== undefined) {
    const t = override.threshold;
    if (!(t >= 0 && t <= 1)) throw new PolicyError("override", "release.threshold", `code "${code}": release.threshold ${t} must be between 0 and 1`);
    if (t < auto.threshold) {
      throw new PolicyError("override", "release.threshold", `code "${code}": release.threshold ${t} is below the ${l} default ${auto.threshold}; overrides may only raise it`);
    }
    threshold = t;
  }

  return deepFreeze<Policy>({
    code,
    archetype: a,
    autonomy: l,
    risk: r,
    pattern: arch.pattern,
    thresholded: arch.thresholded,
    grader: arch.grader,
    pricingUnit: arch.pricingUnit,
    northStar: arch.northStar,
    steering: [...arch.steering],
    approval: { reversible: auto.reversible, irreversible: auto.irreversible },
    release: { measure: auto.measure, threshold, targetRequired: auto.targetRequired, longRuns: auto.longRuns },
    safety: { ...risk, sets: [...risk.sets] },
  });
}
