// Smoke test for the voice spike server (Requirement 20, D-36).
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { FIXED_REPLY, createSpikeServer, type SpikeOptions } from "../voice-spike-server.ts";

let server: http.Server | undefined;
const logs: string[] = [];

async function start(opts: SpikeOptions = {}): Promise<string> {
  logs.length = 0;
  server = createSpikeServer({ ...opts, log: (l) => logs.push(l) });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const body = (stream: boolean) =>
  JSON.stringify({ model: "x", stream, messages: [{ role: "user", content: "my secret answer 42" }] });

describe("voice spike server", () => {
  it("streams chat.completion.chunk events and ends with [DONE]", async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/chat/completions`, { method: "POST", body: body(true) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const events = (await res.text()).split("\n\n").filter(Boolean);
    expect(events.at(-1)).toBe("data: [DONE]");
    const chunks = events.slice(0, -1).map((e) => JSON.parse(e.replace(/^data: /, "")));
    expect(chunks.every((c) => c.object === "chat.completion.chunk")).toBe(true);
    expect(chunks[0].choices[0].delta.role).toBe("assistant");
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
    expect(chunks.map((c) => c.choices[0].delta.content ?? "").join("")).toBe(FIXED_REPLY);
  });

  it("returns one chat.completion without stream", async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/chat/completions`, { method: "POST", body: body(false) });
    const json = await res.json();
    expect(json.object).toBe("chat.completion");
    expect(json.choices[0].message.content).toBe(FIXED_REPLY);
  });

  it("logs timings and counts, never message content", async () => {
    const base = await start();
    await (await fetch(`${base}/v1/chat/completions`, { method: "POST", body: body(true) })).text();
    await new Promise((r) => setTimeout(r, 20));
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0]!);
    expect(line).toMatchObject({ method: "POST", path: "/v1/chat/completions", status: 200, stream: true, messages: 1 });
    expect(typeof line.first_byte_ms).toBe("number");
    expect(typeof line.first_content_ms).toBe("number");
    expect(logs[0]).not.toMatch(/secret answer/);
  });

  it("delays the first content chunk when asked", async () => {
    const base = await start({ firstTokenDelayMs: 120 });
    await (await fetch(`${base}/v1/chat/completions`, { method: "POST", body: body(true) })).text();
    await new Promise((r) => setTimeout(r, 20));
    const line = JSON.parse(logs[0]!);
    expect(line.first_content_ms).toBeGreaterThanOrEqual(100);
    expect(line.first_byte_ms).toBeLessThan(line.first_content_ms);
  });

  it("checks the bearer secret when one is set", async () => {
    const base = await start({ secret: "s3cret" });
    const url = `${base}/v1/chat/completions`;
    expect((await fetch(url, { method: "POST", body: body(false) })).status).toBe(401);
    expect((await fetch(url, { method: "POST", body: body(false), headers: { authorization: "Bearer wrong!" } })).status).toBe(401);
    expect((await fetch(url, { method: "POST", body: body(false), headers: { authorization: "Bearer s3cret" } })).status).toBe(200);
  });

  it("answers 404 for other routes and 400 for bad JSON", async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/chat/completions`)).status).toBe(404);
    expect((await fetch(`${base}/v1/models`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await fetch(`${base}/v1/chat/completions`, { method: "POST", body: "nope" })).status).toBe(400);
  });
});
