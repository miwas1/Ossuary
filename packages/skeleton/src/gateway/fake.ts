// The scripted fake provider (Requirement 24). It makes no network call and serves only `fake`
// vendors, so every automated test runs without keys, network or spend.
import { ProviderError } from "../errors.ts";
import type { Models } from "../manifest/schemas.ts";
import type { Usage } from "../money.ts";
import { promptTokenEstimate } from "./estimate.ts";
import { textOf, type Provider, type ProviderRequest, type ProviderResponse } from "./types.ts";

export type FakeOutcome =
  | { kind: "ok"; text: string; usage?: Partial<Usage> }
  | { kind: "server" }
  | { kind: "client" }
  | { kind: "rate_limited"; retryAfterMs?: number }
  | { kind: "timeout" }
  | { kind: "partial"; text: string; then: "server" | "timeout" };

export type FakeScript = readonly FakeOutcome[] | ((req: ProviderRequest, n: number) => FakeOutcome);

export interface FakeTokenCount {
  /** The prompt's text, all segments joined with "\n". */
  text: string;
  inputTokens: number;
}

export interface FakeProvider extends Provider {
  readonly requests: ProviderRequest[];
}

export const FAKE_VENDORS = ["fake", "fake-b"] as const;

export function promptText(req: Pick<ProviderRequest, "segments">): string {
  return req.segments.map((s) => textOf(s.parts)).join("\n");
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));
}

export function createFakeProvider(script: FakeScript, opts: { tokenCounts?: readonly FakeTokenCount[] } = {}): FakeProvider {
  const requests: ProviderRequest[] = [];
  const counts = new Map((opts.tokenCounts ?? []).map((c) => [c.text, c.inputTokens]));
  return {
    vendors: FAKE_VENDORS,
    requests,
    async send(req: ProviderRequest): Promise<ProviderResponse> {
      if (!(FAKE_VENDORS as readonly string[]).includes(req.modelId.slice(0, req.modelId.indexOf(":")))) {
        throw new ProviderError("client", `the fake provider serves only fake vendors, not ${req.modelId}`, { status: 400 });
      }
      const n = requests.length;
      requests.push(req);
      if (req.signal.aborted) throw new ProviderError("timeout", "aborted before the call");
      const outcome = typeof script === "function" ? script(req, n) : script[n % Math.max(script.length, 1)];
      if (!outcome) throw new ProviderError("client", "fake script is empty", { status: 400 });
      switch (outcome.kind) {
        case "ok": {
          const recorded = counts.get(promptText(req));
          const input = outcome.usage?.inputTokens ?? recorded ?? promptTokenEstimate(req.segments);
          return {
            text: outcome.text,
            model: req.model,
            finishReason: "stop",
            inputTokens: input,
            cacheReadTokens: outcome.usage?.cacheReadTokens ?? 0,
            cacheWriteTokens: outcome.usage?.cacheWriteTokens ?? 0,
            outputTokens: outcome.usage?.outputTokens ?? Math.min(req.maxOutputTokens, Math.max(1, Math.ceil(outcome.text.length / 4))),
          };
        }
        case "server":
          throw new ProviderError("server", "fake server error", { status: 500 });
        case "client":
          throw new ProviderError("client", "fake client error", { status: 400 });
        case "rate_limited":
          throw new ProviderError("rate_limited", "fake rate limit", outcome.retryAfterMs === undefined ? { status: 429 } : { status: 429, retryAfterMs: outcome.retryAfterMs });
        case "timeout":
          await waitForAbort(req.signal);
          throw new ProviderError("timeout", "fake timeout");
        case "partial":
          if (outcome.then === "timeout") await waitForAbort(req.signal);
          throw new ProviderError(outcome.then, "fake failure after a partial response", { partialText: outcome.text });
      }
    },
  };
}

const FAKE_PRICE = {
  input: 1,
  cached_input: 0.1,
  cache_write_input: 1.25,
  output: 2,
  currency: "USD" as const,
  source: "https://example.invalid/fake-prices",
  checked: "2026-11-26",
};

/** A valid model register on fake vendors, for --fake runs and tests (D-64). */
export function fakeModelRegister(): Models {
  return {
    tiers: {
      small: { primary: "fake:small", fallback: "fake-b:small" },
      mid: { primary: "fake:mid", fallback: "fake-b:mid" },
      frontier: { primary: "fake:frontier", fallback: "fake-b:frontier" },
    },
    prices: Object.fromEntries(
      ["fake:small", "fake-b:small", "fake:mid", "fake-b:mid", "fake:frontier", "fake-b:frontier"].map((id) => [id, { ...FAKE_PRICE }]),
    ),
  };
}
