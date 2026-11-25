// thresholds.yaml format and comparison (Requirement 11, D-17, D-29).
// Each entry is `key: { min: <n> }` (higher is stricter) or `key: { max: <n> }` (lower is stricter).
import { isMap, isScalar, parseDocument } from "yaml";

export type Entry = { dir: "min" | "max"; value: number };
export type Doc = Map<string, Entry>;
export type FormatError = { file: string; key?: string; message: string };
export type Kind = "min-lowered" | "max-raised" | "removed" | "direction-changed";
export type Loosening = { file: string; key: string; kind: Kind; before: Entry; after?: Entry };

export function parseThresholds(file: string, text: string): { ok: true; doc: Doc } | { ok: false; errors: FormatError[] } {
  const parsed = parseDocument(text, { uniqueKeys: true });
  if (parsed.errors.length > 0) {
    return { ok: false, errors: parsed.errors.map((e) => ({ file, message: e.message.split("\n")[0] ?? e.message })) };
  }
  const doc: Doc = new Map();
  const root = parsed.contents;
  if (root === null || (isScalar(root) && root.value === null)) return { ok: true, doc };
  if (!isMap(root)) return { ok: false, errors: [{ file, message: "the file must be a mapping of key: { min: n } or key: { max: n }" }] };

  const errors: FormatError[] = [];
  for (const pair of root.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : undefined;
    if (key === undefined) {
      errors.push({ file, message: "every key must be a plain scalar" });
      continue;
    }
    const value = pair.value;
    if (!isMap(value) || value.items.length !== 1) {
      errors.push({ file, key, message: "must be exactly one of { min: <number> } or { max: <number> }" });
      continue;
    }
    const [inner] = value.items;
    const dir = inner && isScalar(inner.key) ? inner.key.value : undefined;
    const num = inner && isScalar(inner.value) ? inner.value.value : undefined;
    if (dir !== "min" && dir !== "max") {
      errors.push({ file, key, message: `direction must be min or max, not ${JSON.stringify(dir)}` });
    } else if (typeof num !== "number" || !Number.isFinite(num)) {
      errors.push({ file, key, message: `${dir} must be a finite number, not ${JSON.stringify(num)}` });
    } else {
      doc.set(key, { dir, value: num });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, doc };
}

/** Every key in `base` that `head` loosens. Added, unchanged and tightened keys are never reported. */
export function compareThresholds(file: string, base: Doc, head: Doc): Loosening[] {
  const out: Loosening[] = [];
  for (const [key, before] of [...base.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const after = head.get(key);
    if (after === undefined) out.push({ file, key, kind: "removed", before });
    else if (after.dir !== before.dir) out.push({ file, key, kind: "direction-changed", before, after });
    else if (before.dir === "min" && after.value < before.value) out.push({ file, key, kind: "min-lowered", before, after });
    else if (before.dir === "max" && after.value > before.value) out.push({ file, key, kind: "max-raised", before, after });
  }
  return out;
}

export const showEntry = (e?: Entry): string => (e ? `{ ${e.dir}: ${e.value} }` : "(removed)");
