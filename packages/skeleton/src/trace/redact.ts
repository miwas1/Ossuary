// Redaction before storage (Requirement 23, OPS-09). Secrets first, then email addresses, then phone
// numbers. The replacement tokens hold no digit, "@" or secret text, so a second pass changes nothing.

const SECRET_NAME = /(_KEY|_SECRET|_TOKEN|_PASSWORD)$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// A separator run of up to two characters between digits: space, dot, hyphen or parentheses.
const S = "[ .()\\-]{0,2}";
const digits = (n: number) => Array.from({ length: n }, () => "\\d").join(S);
const PHONES = [
  // Nigerian mobile, local form: 070, 071, 080, 081, 090 or 091, then 8 more digits. "(0803) 123-4567".
  new RegExp(`(?<![\\d+])\\(?0[789][01]${S}${digits(8)}(?!\\d)`, "g"),
  // Nigerian mobile, international form: +234, 234 or +234 (0), then the number without its leading 0.
  new RegExp(`(?<![\\d+])\\+?234${S}(?:\\(0\\)${S})?[789][01]${S}${digits(8)}(?!\\d)`, "g"),
  // Any international number: + then 8 to 15 digits (covers +234 landlines such as +234 1 234 5678).
  new RegExp(`\\+\\d(?:${S}\\d){7,14}(?!\\d)`, "g"),
];

export type Redactor = <T>(value: T) => T;

/** Secret values from the environment: 8+ characters, from *_KEY, *_SECRET, *_TOKEN, *_PASSWORD or DATABASE_URL. */
export function secretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([name, value]) => value !== undefined && value.length >= 8 && (SECRET_NAME.test(name) || name === "DATABASE_URL"))
    .map(([, value]) => value as string)
    .sort((a, b) => b.length - a.length);
}

export function redactText(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) if (out.includes(secret)) out = out.split(secret).join("[secret]");
  out = out.replace(EMAIL, "[email]");
  for (const re of PHONES) out = out.replace(re, "[phone]");
  return out;
}

/** Build a redactor over the given environment's secret values. */
export function createRedactor(env: NodeJS.ProcessEnv = process.env): Redactor {
  const secrets = secretValues(env);
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return redactText(value, secrets);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return <T>(value: T) => walk(value) as T;
}

/** Redact with the current process environment's secrets. */
export function redact<T>(value: T): T {
  return createRedactor(process.env)(value);
}
