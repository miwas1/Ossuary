// Boundary rules (Requirement 7): where vendor SDKs may be imported, and the skeleton's public entry.
import path from "node:path";
import ts from "typescript";

export type RuleId = "model-vendor-sdk" | "elevenlabs-server-sdk" | "elevenlabs-browser-sdk" | "skeleton-internals";

export interface Violation {
  file: string;
  line: number;
  specifier: string;
  rule: RuleId;
  message: string;
}

export interface Rule {
  id: Exclude<RuleId, "skeleton-internals">;
  /** Exact package names, or "@scope/*" for a whole scope. */
  packages: readonly string[];
  /** Repo-relative folder prefixes (with trailing slash) where the import is allowed. */
  allowedUnder: readonly string[];
  message: string;
}

export const PROVIDERS_DIR = "packages/skeleton/src/gateway/providers/";
export const SEANCE_APP_DIR = "apps/seance/src/app/";
export const SKELETON_DIR = "packages/skeleton";
export const SKELETON_PACKAGE = "@ossuary/skeleton";

/** The one list of restricted packages. Order matters: the first matching rule wins. */
export const RESTRICTED: readonly Rule[] = [
  {
    id: "elevenlabs-browser-sdk",
    packages: ["@elevenlabs/react", "@elevenlabs/client"],
    allowedUnder: [SEANCE_APP_DIR],
    message: `the ElevenLabs browser SDK is allowed only under ${SEANCE_APP_DIR} (D-18)`,
  },
  {
    id: "elevenlabs-server-sdk",
    packages: ["@elevenlabs/*", "@11labs/*", "elevenlabs"],
    allowedUnder: [],
    message: "the ElevenLabs server SDK is not allowed; fetch signed URLs with plain fetch in packages/skeleton/src/harness/voice/ (D-18, D-21)",
  },
  {
    id: "model-vendor-sdk",
    packages: [
      "@anthropic-ai/*",
      "openai",
      "@openai/*",
      "@google/genai",
      "@google/generative-ai",
      "@google-cloud/vertexai",
      "@mistralai/*",
      "cohere-ai",
      "groq-sdk",
      "@ai-sdk/*",
      "@aws-sdk/client-bedrock-runtime",
      "@huggingface/inference",
      "together-ai",
      "@deepseek/*",
      "@xai/*",
      "ollama",
    ],
    allowedUnder: [PROVIDERS_DIR],
    message: `model vendor SDKs may be imported only in ${PROVIDERS_DIR} (MODEL-01)`,
  },
];

/** The package a bare specifier refers to, or null for relative, absolute, URL and node: specifiers. */
export function packageName(specifier: string): string | null {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.includes(":") || specifier.includes("\\")) {
    return null;
  }
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  return parts[0] ?? null;
}

export function matchesPackage(pkg: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) return pkg.startsWith(pattern.slice(0, -1));
  return pkg === pattern;
}

export function ruleFor(pkg: string): Rule | undefined {
  return RESTRICTED.find((rule) => rule.packages.some((pattern) => matchesPackage(pkg, pattern)));
}

function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** Every module specifier the file imports, by a real parse (strings and comments are ignored). */
export function findImports(fileName: string, text: string): { specifier: string; line: number }[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const found: { specifier: string; line: number }[] = [];
  const add = (node: ts.Node | undefined): void => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      found.push({ specifier: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require")) {
        add(node.arguments[0]);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export interface CheckContext {
  /** Keys of the skeleton package's `exports`, such as ".", "./ui". */
  skeletonExports: readonly string[];
}

/** Check one file. `file` is a repo-relative POSIX path. */
export function checkFile(file: string, text: string, ctx: CheckContext): Violation[] {
  const violations: Violation[] = [];
  const inApp = /^apps\/[^/]+\//.test(file);
  for (const { specifier, line } of findImports(file, text)) {
    const pkg = packageName(specifier);
    if (pkg) {
      const rule = ruleFor(pkg);
      if (rule && !rule.allowedUnder.some((prefix) => file.startsWith(prefix))) {
        violations.push({ file, line, specifier, rule: rule.id, message: rule.message });
      }
    }
    if (!inApp) continue;
    if (specifier.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (resolved === SKELETON_DIR || resolved.startsWith(`${SKELETON_DIR}/`)) {
        violations.push({
          file,
          line,
          specifier,
          rule: "skeleton-internals",
          message: `apps import the skeleton only as ${SKELETON_PACKAGE}, never by path (ARCH-02)`,
        });
      }
    } else if (pkg === SKELETON_PACKAGE && specifier !== SKELETON_PACKAGE) {
      const sub = `./${specifier.slice(SKELETON_PACKAGE.length + 1)}`;
      if (!ctx.skeletonExports.includes(sub)) {
        violations.push({
          file,
          line,
          specifier,
          rule: "skeleton-internals",
          message: `${sub} is not in ${SKELETON_PACKAGE}'s exports; import from ${SKELETON_PACKAGE} (ARCH-02, D-07)`,
        });
      }
    }
  }
  return violations;
}

/** Read the export keys of a package.json `exports` field. */
export function exportKeys(exportsField: unknown): string[] {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) return ["."];
  if (exportsField && typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    return keys.some((k) => k.startsWith(".")) ? keys.filter((k) => k.startsWith(".")) : ["."];
  }
  return [];
}
