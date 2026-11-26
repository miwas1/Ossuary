// Vendor failures → the gateway's failure classes (Requirement 9.1, 14, D-70).
// 5xx and network errors are server; 429 and overloaded are rate_limited; other 4xx are client.
import { ProviderError, type FailureClass } from "../../errors.ts";

type HeaderSource = Headers | Record<string, string | null | undefined> | undefined | null;

function header(h: HeaderSource, name: string): string | undefined {
  if (!h) return undefined;
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | null | undefined>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  return key ? (rec[key] ?? undefined) : undefined;
}

/** Milliseconds from retry-after-ms, or Retry-After as seconds or an HTTP date. Unset when missing or unreadable. */
export function parseRetryAfter(h: HeaderSource, nowMs: number = Date.now()): number | undefined {
  const ms = header(h, "retry-after-ms");
  if (ms !== undefined && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.ceil(Number(ms));
  const value = header(h, "retry-after")?.trim();
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

export function classifyStatus(status: number): FailureClass {
  if (status === 429 || status === 529) return "rate_limited";
  if (status >= 500) return "server";
  return "client";
}

/** Turn whatever an SDK threw into a ProviderError, without copying its message (it can echo the request). */
export function toProviderError(vendor: string, err: unknown, nowMs: number = Date.now()): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = (err ?? {}) as { status?: unknown; headers?: HeaderSource; name?: unknown; error?: { error?: { type?: unknown }; type?: unknown } };
  const name = typeof e.name === "string" ? e.name : "Error";
  if (name === "AbortError" || name === "APIUserAbortError" || name === "APIConnectionTimeoutError") {
    return new ProviderError("timeout", `${vendor} request timed out`);
  }
  if (typeof e.status === "number") {
    const failure = classifyStatus(e.status);
    const kind = e.error?.error?.type ?? e.error?.type;
    const message = `${vendor} HTTP ${e.status}${typeof kind === "string" ? ` (${kind})` : ""}`;
    const retryAfterMs = failure === "rate_limited" ? parseRetryAfter(e.headers, nowMs) : undefined;
    return new ProviderError(failure, message, retryAfterMs === undefined ? { status: e.status } : { status: e.status, retryAfterMs });
  }
  return new ProviderError("server", `${vendor} request failed (${name})`);
}
