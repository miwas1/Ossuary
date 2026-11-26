// The scripted fake for `--fake` runs and tests: a fixed epitaph, and a judge that passes it.
import { createFakeProvider } from "@ossuary/skeleton";

export const FAKE_EPITAPH = "Here lies the keeper, who kept every light but his own.";

export function echoFakeProvider() {
  return createFakeProvider((req) =>
    req.modelId.endsWith(":mid")
      ? { kind: "ok", text: JSON.stringify({ pass: true, score: 0.9, feedback: "Carve it." }) }
      : { kind: "ok", text: FAKE_EPITAPH },
  );
}
