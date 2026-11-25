// Voice latency spike (Requirement 20): a stub OpenAI-compatible POST /v1/chat/completions.
// It returns a fixed reply, calls no model, and logs request timing (never message content),
// so ElevenLabs Custom LLM latency can be measured through a tunnel before Séance exists.
// Node built-ins only. Run with: pnpm spike:voice   (PORT, VOICE_LLM_SECRET, SPIKE_FIRST_TOKEN_DELAY_MS)
import { randomUUID, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const FIXED_REPLY = "Hello, I'm the Séance test interviewer, and I'm an AI. This is a fixed reply from the latency spike server.";
export const SPIKE_MODEL_LABEL = "ossuary-voice-spike"; // a label for the stub, not a vendor model ID
const MAX_BODY_BYTES = 1024 * 1024;

export interface SpikeOptions {
  /** When set, requests must send `Authorization: Bearer <secret>`. */
  secret?: string;
  /** Delay before the first content chunk, to simulate a slow first token. */
  firstTokenDelayMs?: number;
  /** Receives one JSON line per request. Defaults to stdout. */
  log?: (line: string) => void;
}

export interface TimingLog {
  at: string;
  method: string;
  path: string;
  status: number;
  stream: boolean;
  messages: number;
  first_byte_ms: number | null;
  first_content_ms: number | null;
  last_byte_ms: number;
}

function authorized(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSpikeServer(opts: SpikeOptions = {}): http.Server {
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const delay = Math.max(0, opts.firstTokenDelayMs ?? 0);

  return http.createServer((req, res) => {
    const t0 = performance.now();
    const ms = () => Math.round((performance.now() - t0) * 10) / 10;
    const entry: TimingLog = {
      at: new Date().toISOString(),
      method: req.method ?? "",
      path: (req.url ?? "").split("?")[0] ?? "",
      status: 0,
      stream: false,
      messages: 0,
      first_byte_ms: null,
      first_content_ms: null,
      last_byte_ms: 0,
    };
    const firstByte = () => {
      if (entry.first_byte_ms === null) entry.first_byte_ms = ms();
    };
    res.on("finish", () => {
      entry.status = res.statusCode;
      entry.last_byte_ms = ms();
      log(JSON.stringify(entry));
    });
    const send = (status: number, body: unknown) => {
      firstByte();
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const fail = (status: number, message: string) => send(status, { error: { message, type: "invalid_request_error" } });

    if (req.method !== "POST" || entry.path !== "/v1/chat/completions") return fail(404, "not found");
    if (opts.secret && !authorized(req.headers.authorization, opts.secret)) return fail(401, "missing or wrong bearer token");

    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooBig = true;
      else chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooBig) return fail(413, "request body over 1 MB");
      let body: { stream?: unknown; messages?: unknown };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof body;
        if (!body || typeof body !== "object") throw new Error("not an object");
      } catch {
        return fail(400, "body must be a JSON object");
      }
      entry.stream = body.stream === true;
      entry.messages = Array.isArray(body.messages) ? body.messages.length : 0;
      const id = `chatcmpl-spike-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);

      if (!entry.stream) {
        entry.first_content_ms = ms();
        return send(200, {
          id,
          object: "chat.completion",
          created,
          model: SPIKE_MODEL_LABEL,
          choices: [{ index: 0, message: { role: "assistant", content: FIXED_REPLY }, finish_reason: "stop" }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      }

      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
        `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: SPIKE_MODEL_LABEL, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      firstByte();
      res.write(chunk({ role: "assistant", content: "" }));
      void (async () => {
        if (delay > 0) await sleep(delay);
        const words = FIXED_REPLY.split(/(?<= )/);
        for (const [i, word] of words.entries()) {
          if (i === 0) entry.first_content_ms = ms();
          res.write(chunk({ content: word }));
        }
        res.write(chunk({}, "stop"));
        res.end("data: [DONE]\n\n");
      })();
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787);
  const secret = process.env.VOICE_LLM_SECRET || undefined;
  const firstTokenDelayMs = Number(process.env.SPIKE_FIRST_TOKEN_DELAY_MS ?? 0) || 0;
  createSpikeServer({ secret, firstTokenDelayMs }).listen(port, () => {
    console.error(
      `voice spike server on http://localhost:${port}/v1/chat/completions` +
        ` (auth ${secret ? "on" : "off"}, first-token delay ${firstTokenDelayMs} ms)`,
    );
  });
}
