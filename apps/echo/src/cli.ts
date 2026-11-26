// pnpm --filter echo task [--fake] [--workspace <id>] "<topic>"   (Requirement 26.3 to 26.5)
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { countSpans, createDb, createGateway, fakeModelRegister, type GenerateEvaluateOutput } from "@ossuary/skeleton";
import { createEchoApp } from "./domain/app.ts";
import { echoFakeProvider } from "./fake.ts";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
// ECHO_NO_ENV_FILE=1 lets tests run the CLI without the developer's .env.
if (process.env.ECHO_NO_ENV_FILE !== "1" && fs.existsSync(envFile)) process.loadEnvFile(envFile);

let fake = false;
let workspaceId: string | undefined = "local";
const words: string[] = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string;
  if (a === "--fake") fake = true;
  else if (a === "--workspace") workspaceId = args[++i];
  else words.push(a);
}
const topic = words.join(" ").trim();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("echo: DATABASE_URL is not set (see .env.example)");
  process.exit(1);
}
if (!topic || !workspaceId) {
  console.error('usage: pnpm --filter echo task [--fake] [--workspace <id>] "<topic>"');
  process.exit(2);
}

const db = await createDb(url);
try {
  await db.migrate();
  const models = fake ? fakeModelRegister() : undefined;
  const app = createEchoApp(models ? { models } : {});
  const gateway = fake ? createGateway({ models: app.models, db, providers: [echoFakeProvider()], vendorAdapters: false }) : createGateway({ models: app.models, db });
  const result = await app.runTask<GenerateEvaluateOutput<string>>({ input: { topic }, workspaceId, db, gateway });
  const lines = [
    `task:     ${result.taskId}`,
    `trace:    ${result.traceId}`,
    `status:   ${result.status}${result.stop ? ` (${result.stop.scope} ${result.stop.kind} cap)` : ""}${result.error ? ` (${result.error.class}: ${result.error.message})` : ""}`,
    `accepted: ${result.output?.accepted ?? false}`,
    `text:     ${result.output?.candidate ?? ""}`,
    `cost:     $${(result.spendMicros / 1e6).toFixed(6)}${fake ? " (fake prices)" : ""}`,
    `spans:    ${await countSpans(db, result.traceId)}`,
  ];
  console.log(lines.join("\n"));
  process.exitCode = result.status === "failed" ? 1 : 0;
} finally {
  await db.close();
}
