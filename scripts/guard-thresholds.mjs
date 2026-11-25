#!/usr/bin/env node
// Threshold guard: a Kiro PreToolUse command hook (Requirement 9, D-05, D-06, D-23, D-24, D-27, D-32).
//
// Reads one hook payload ({ tool_name, tool_input, cwd?, ... }) from stdin and exits:
//   2  to block the tool call (reasons on stderr): any write, delete or move of a
//      **/evals/thresholds.yaml, or any change, move or delete of an existing file
//      under **/evals/tasks/ (eval tasks are append-only);
//   0  otherwise, printing nothing to stdout.
// It fails closed: an unreadable payload or an internal error also exits 2.
// Node built-ins only, so a broken install can't disable it.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const FOOTER =
  "Thresholds are loosened only by a person, in a pull request labelled thresholds-change. " +
  "Eval tasks are append-only: add new task files, never change, move or delete existing ones. " +
  "See docs/decisions.md (D-05, D-06, D-32).";

// ---------------------------------------------------------------------------
// Paths

/** Turn any path spelling (Windows, WSL UNC, file URL, relative) into a POSIX path. */
function toPosixAbsoluteish(p) {
  let s = String(p).trim();
  if (/^file:\/\//i.test(s)) {
    try {
      s = fileURLToPath(s);
    } catch {
      s = s.replace(/^file:\/\//i, "");
    }
  }
  s = s.replace(/\\/g, "/");
  const unc = /^\/\/(?:wsl\.localhost|wsl\$)\/[^/]+(\/.*)?$/i.exec(s);
  if (unc) s = unc[1] || "/";
  const drive = /^([A-Za-z]):(\/.*)?$/.exec(s);
  if (drive) s = `/mnt/${drive[1].toLowerCase()}${drive[2] || "/"}`;
  return s;
}

/** The Normalized path of the glossary, case preserved (matching lowercases it). */
export function normalizePath(p, cwd) {
  let s = toPosixAbsoluteish(p);
  if (!s.startsWith("/")) s = path.posix.join(toPosixAbsoluteish(cwd || "/"), s);
  s = path.posix.normalize(s);
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

export function isThresholdFile(normPath) {
  return /(^|\/)evals\/thresholds\.ya?ml$/.test(normPath.toLowerCase());
}

export function isTaskPath(normPath) {
  return /(^|\/)evals\/tasks(\/|$)/.test(normPath.toLowerCase());
}

// ---------------------------------------------------------------------------
// Tools

const EXACT = {
  write: ["fs_write", "fs_append", "str_replace", "semantic_rename", "write", "edit", "create"],
  delete: ["delete_file", "delete"],
  move: ["smart_relocate", "move", "rename"],
  shell: ["execute_bash", "control_bash_process", "execute_pwsh", "execute_cmd", "shell", "bash"],
};

/** @returns {'write'|'delete'|'move'|'shell'|'other'} */
export function classifyTool(toolName) {
  const name = String(toolName);
  for (const [kind, names] of Object.entries(EXACT)) if (names.includes(name)) return /** @type any */ (kind);
  if (/bash|shell|exec|command|terminal|pwsh|powershell/i.test(name)) return "shell";
  if (/delete|remove|unlink/i.test(name)) return "delete";
  if (/move|relocate|rename/i.test(name)) return "move";
  if (/write|append|replace|edit|create|insert|patch/i.test(name)) return "write";
  return "other";
}

const PATH_KEY = /path|file|dir|target|dest|source|src|^to$|^from$/i;
const SOURCE_KEY = /source|src|^from|^old/i;
const DEST_KEY = /dest|target|^to$|^to[A-Z_]|^new/i;

/** Collect path-like strings from tool_input, tagged with the key they came from. */
function collectPaths(value, key = "", out = []) {
  if (typeof value === "string") {
    if (key && PATH_KEY.test(key) && value.length > 0 && value.length < 4096 && !value.includes("\n")) {
      out.push({ key, value });
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectPaths(v, key, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectPaths(v, k, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// File system probe (injected in tests)

const SKIP_DIRS = new Set(["node_modules", ".git", ".turbo", ".next", "dist", "coverage"]);

function realExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** True when `dir` is a directory holding a threshold file or an evals/tasks folder at any depth. */
function realProbeDir(dir, { maxDepth = 8, maxEntries = 20000 } = {}) {
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    return false;
  }
  if (!stat.isDirectory()) return false;
  if (dir.split("/").some((seg) => SKIP_DIRS.has(seg))) return false;
  let seen = 0;
  const queue = [{ dir, depth: 0 }];
  while (queue.length > 0) {
    const { dir: current, depth } = /** @type {{dir: string, depth: number}} */ (queue.shift());
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const inEvals = path.posix.basename(current).toLowerCase() === "evals";
    for (const entry of entries) {
      seen += 1;
      if (seen > maxEntries) return true; // too big to check: fail closed
      const lower = entry.name.toLowerCase();
      if (inEvals && (lower === "thresholds.yaml" || lower === "thresholds.yml" || lower === "tasks")) return true;
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        if (depth + 1 > maxDepth) return true; // too deep to check: fail closed
        queue.push({ dir: path.posix.join(current, entry.name), depth: depth + 1 });
      }
    }
  }
  return false;
}

export const realFsProbe = { exists: realExists, probeDir: (p) => realProbeDir(p) };

/** Check both the raw and the normalized spelling, so the guard works whichever OS runs it. */
function probeBoth(fn, raw, norm) {
  return fn(norm) || (raw !== norm && fn(raw));
}

// ---------------------------------------------------------------------------
// Shell analysis (best effort, D-24)

const READ_ONLY = new Set(["cat", "less", "more", "head", "tail", "grep", "egrep", "fgrep", "rg", "wc", "diff", "ls", "stat", "file", "bat"]);
const READ_ONLY_GIT = new Set(["diff", "log", "show", "status", "blame", "add", "commit", "ls-files"]);
const TASK_SAFE_EXTRA = new Set(["mkdir", "touch"]);
const DELETE_OR_MOVE = new Set(["rm", "rmdir", "unlink", "shred", "mv"]);
const WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time", "nice", "builtin", "exec"]);
// Raw-text fallbacks catch globs and variables the tokenizer can't resolve. They need a
// boundary on both sides, so near misses such as myevals/ or thresholds.yaml.bak pass.
const RAW_THRESHOLD = /(?:^|[^A-Za-z0-9_.-])evals[\\/]+thresholds\.ya?ml(?![A-Za-z0-9_.~-])/i;
const RAW_TASKS = /(?:^|[^A-Za-z0-9_.-])evals[\\/]+tasks(?![A-Za-z0-9_.~-])/i;

/** Split a command line into segments of words, honouring quotes. Redirect targets are returned apart. */
export function splitShell(command) {
  const segments = [];
  let words = [];
  let redirects = [];
  let raw = "";
  let word = "";
  let inWord = false;
  let pendingRedirect = false;
  const pushWord = () => {
    if (!inWord) return;
    if (pendingRedirect) {
      redirects.push(word);
      pendingRedirect = false;
    } else {
      words.push(word);
    }
    word = "";
    inWord = false;
  };
  const pushSegment = () => {
    pushWord();
    if (words.length > 0 || redirects.length > 0) segments.push({ words, redirects, raw: raw.trim() });
    words = [];
    redirects = [];
    raw = "";
  };
  const s = String(command);
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const stop = end === -1 ? s.length : end;
      word += s.slice(i + 1, stop);
      raw += s.slice(i, stop + 1);
      inWord = true;
      i = stop;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length) {
          word += s[j + 1];
          j += 2;
          continue;
        }
        word += s[j];
        j += 1;
      }
      raw += s.slice(i, j + 1);
      inWord = true;
      i = j;
      continue;
    }
    raw += c;
    if (c === "\\" && i + 1 < s.length && s[i + 1] !== "\n") {
      word += s[i + 1];
      raw += s[i + 1];
      inWord = true;
      i += 1;
      continue;
    }
    if (c === ";" || c === "\n" || c === "|" || c === "&") {
      // `&>` is a redirect, not a separator
      if (c === "&" && s[i + 1] === ">") {
        pushWord();
        pendingRedirect = true;
        raw += ">";
        i += 1;
        if (s[i + 1] === ">") {
          raw += ">";
          i += 1;
        }
        continue;
      }
      raw = raw.slice(0, -1);
      pushSegment();
      if ((c === "|" || c === "&") && s[i + 1] === c) i += 1;
      continue;
    }
    if (c === ">" || c === "<") {
      // a leading fd number (1>, 2>) belongs to the redirect, not to a word
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else {
        pushWord();
      }
      if (s[i + 1] === ">" || s[i + 1] === "|") {
        raw += s[i + 1];
        i += 1;
      }
      if (s[i + 1] === "&") {
        // 2>&1: duplicates a descriptor, no file
        raw += s[i + 1];
        i += 1;
        while (i + 1 < s.length && /\d/.test(s[i + 1])) {
          raw += s[i + 1];
          i += 1;
        }
        continue;
      }
      if (c === ">") pendingRedirect = true;
      continue;
    }
    if (c === " " || c === "\t") {
      pushWord();
      continue;
    }
    word += c;
    inWord = true;
  }
  pushSegment();
  return segments;
}

/** Strip env assignments and wrappers; return the command words. */
function commandWords(words) {
  let i = 0;
  while (i < words.length) {
    const w = /** @type {string} */ (words[i]);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w)) {
      i += 1;
      continue;
    }
    break;
  }
  return words.slice(i);
}

function baseName(cmd) {
  return path.posix.basename(String(cmd || ""));
}

function isReadOnly(cmdWords, { forTasks }) {
  const cmd = baseName(cmdWords[0]);
  if (READ_ONLY.has(cmd)) return true;
  if (forTasks && TASK_SAFE_EXTRA.has(cmd)) return true;
  if (cmd === "git") {
    const sub = cmdWords.slice(1).find((w) => !w.startsWith("-"));
    return sub !== undefined && READ_ONLY_GIT.has(sub);
  }
  if (cmd === "pnpm" || cmd === "npm") {
    const args = cmdWords.slice(1).filter((w) => w !== "run");
    return args[0] === "thresholds:check";
  }
  return false;
}

function isDeleteOrMove(cmdWords) {
  const cmd = baseName(cmdWords[0]);
  if (DELETE_OR_MOVE.has(cmd)) return true;
  if (cmd === "git") {
    const sub = cmdWords.slice(1).find((w) => !w.startsWith("-"));
    return sub === "rm" || sub === "mv" || sub === "clean";
  }
  if (cmd === "find") return cmdWords.includes("-delete") || cmdWords.some((w, i) => w === "-exec" && /^(rm|mv|unlink|shred)$/.test(baseName(cmdWords[i + 1])));
  return false;
}

/** For a glob like apps/*\/evals, return the directory before the first glob character. */
function globBase(token) {
  const idx = token.search(/[*?[]/);
  if (idx === -1) return null;
  const head = token.slice(0, idx);
  const slash = head.lastIndexOf("/");
  return slash === -1 ? "." : head.slice(0, slash) || "/";
}

/**
 * @param {string} command
 * @param {string} cwd
 * @param {{exists(p: string): boolean, probeDir(p: string): boolean}} fsProbe
 * @returns {string[]} reasons to block
 */
export function analyseShell(command, cwd, fsProbe, depth = 0) {
  const reasons = [];
  let here = cwd;
  for (const seg of splitShell(command)) {
    const cmdWords = commandWords(seg.words);
    const cmd = baseName(cmdWords[0]);
    if (cmd === "cd") {
      const target = cmdWords[1];
      if (target && !target.startsWith("-")) here = normalizePath(target, here);
      continue;
    }
    // bash -c "...": analyse the inner script too
    if (/^(ba|z|da)?sh$/.test(cmd) && depth < 3) {
      const cIdx = cmdWords.indexOf("-c");
      const inner = cIdx >= 0 ? cmdWords[cIdx + 1] : undefined;
      if (inner) reasons.push(...analyseShell(inner, here, fsProbe, depth + 1));
    }
    const operands = cmdWords.slice(1).filter((w) => !w.startsWith("-") || w.includes("/"));
    const norm = (t) => normalizePath(t, here);
    const label = `shell command \`${seg.raw.slice(0, 160)}\``;

    // Threshold files: only known read-only commands may name them (D-24).
    const redirThreshold = seg.redirects.find((r) => isThresholdFile(norm(r)));
    const namesThreshold =
      redirThreshold !== undefined ||
      cmdWords.some((w) => isThresholdFile(norm(w))) ||
      RAW_THRESHOLD.test(seg.raw);
    if (redirThreshold !== undefined) {
      reasons.push(`${label} redirects into ${norm(redirThreshold)}, a protected thresholds file.`);
    } else if (namesThreshold && !isReadOnly(cmdWords, { forTasks: false })) {
      reasons.push(`${label} names a protected thresholds file with a command that is not read-only.`);
    }

    // Existing eval task files: append-only (D-32).
    const existingTask = (t) => isTaskPath(norm(t)) && probeBoth(fsProbe.exists, t, norm(t));
    const redirTask = seg.redirects.find(existingTask);
    if (redirTask !== undefined) {
      reasons.push(`${label} redirects into ${norm(redirTask)}, an existing eval task (tasks are append-only).`);
    } else if (operands.some(existingTask) && !isReadOnly(cmdWords, { forTasks: true })) {
      reasons.push(`${label} changes an existing eval task under evals/tasks/ (tasks are append-only).`);
    }

    // Deleting or moving anything that is, or contains, an eval task path or threshold file.
    if (isDeleteOrMove(cmdWords)) {
      const hit = operands.find((t) => {
        const n = norm(t);
        if (isTaskPath(n) || isThresholdFile(n)) return true;
        const base = globBase(t);
        const dir = base === null ? n : norm(base);
        return probeBoth(fsProbe.probeDir, base === null ? t : base, dir);
      });
      if (hit !== undefined) {
        reasons.push(`${label} deletes or moves ${norm(hit)}, which is or contains protected eval files.`);
      } else if (RAW_TASKS.test(seg.raw)) {
        reasons.push(`${label} deletes or moves something under evals/tasks/.`);
      }
    }
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Decision

function parseFailure(what, stdinText) {
  const head = String(stdinText).slice(0, 200);
  return {
    exit: 2,
    reasons: [
      `guard-thresholds: blocked because the PreToolUse payload could not be parsed: ${what}.`,
      `First 200 characters of stdin: ${JSON.stringify(head)}`,
      "The guard fails closed on payloads it cannot read. See docs/decisions.md (D-06, \"Hook payload shape\") for the payload shape it expects.",
    ],
  };
}

/**
 * @param {string} stdinText
 * @param {{cwd?: string, fsProbe?: {exists(p: string): boolean, probeDir(p: string): boolean}}} [opts]
 * @returns {{exit: 0 | 2, reasons: string[]}}
 */
export function decide(stdinText, opts = {}) {
  let payload;
  try {
    payload = JSON.parse(stdinText);
  } catch (err) {
    return parseFailure(`invalid JSON (${/** @type {Error} */ (err).message})`, stdinText);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return parseFailure("the payload is not a JSON object", stdinText);
  }
  if (typeof payload.tool_name !== "string") return parseFailure("tool_name is missing or not a string", stdinText);
  const input = payload.tool_input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return parseFailure("tool_input is missing or not an object", stdinText);
  }

  const fsProbe = opts.fsProbe ?? realFsProbe;
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : (opts.cwd ?? process.cwd());
  const kind = classifyTool(payload.tool_name);
  const tool = payload.tool_name;
  const reasons = [];

  if (kind === "shell") {
    const cmd = typeof input.command === "string" ? input.command : "";
    const shellCwd = typeof input.cwd === "string" && input.cwd ? normalizePath(input.cwd, cwd) : cwd;
    reasons.push(...analyseShell(cmd, shellCwd, fsProbe));
  } else if (kind !== "other") {
    for (const { key, value } of collectPaths(input)) {
      const n = normalizePath(value, cwd);
      const exists = () => probeBoth(fsProbe.exists, value, n);
      const contains = () => probeBoth(fsProbe.probeDir, value, n);
      const isSource = kind === "move" && SOURCE_KEY.test(key);
      const isDest = kind === "move" && DEST_KEY.test(key);
      const asSource = kind === "delete" || (kind === "move" && (isSource || !isDest));
      const asTarget = kind === "write" || (kind === "move" && (isDest || !isSource));

      if (isThresholdFile(n)) {
        reasons.push(`${tool} would ${kind} ${n}, a protected thresholds file.`);
        continue;
      }
      if (asSource && (isTaskPath(n) || contains())) {
        reasons.push(`${tool} would ${kind === "delete" ? "delete" : "move away"} ${n}, which is or contains protected eval files.`);
        continue;
      }
      if (asTarget && isTaskPath(n) && exists()) {
        reasons.push(`${tool} would change ${n}, an existing eval task (tasks are append-only).`);
      }
    }
  }

  if (reasons.length === 0) return { exit: 0, reasons: [] };
  return { exit: 2, reasons: [...reasons.map((r) => `guard-thresholds: blocked: ${r}`), FOOTER] };
}

// ---------------------------------------------------------------------------
// Entry point

function capture(dir, stdinText) {
  try {
    let event = "unknown";
    let tool = "none";
    try {
      const p = JSON.parse(stdinText);
      event = String(p.hook_event_name ?? event);
      tool = String(p.tool_name ?? tool);
    } catch {
      /* keep defaults */
    }
    const safe = (s) => s.replace(/[^A-Za-z0-9_.-]/g, "_");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${safe(event)}-${safe(tool)}-${Date.now()}.json`), stdinText);
  } catch (err) {
    process.stderr.write(`guard-thresholds: capture failed: ${/** @type {Error} */ (err).message}\n`);
  }
}

function main() {
  try {
    const stdinText = fs.readFileSync(0, "utf8");
    const capIdx = process.argv.indexOf("--capture");
    if (capIdx !== -1 && process.argv[capIdx + 1]) capture(/** @type {string} */ (process.argv[capIdx + 1]), stdinText);
    const { exit, reasons } = decide(stdinText);
    if (reasons.length > 0) process.stderr.write(`${reasons.join("\n")}\n`);
    process.exitCode = exit;
  } catch (err) {
    process.stderr.write(`guard-thresholds: internal error: ${/** @type {Error} */ (err).message}. Blocking to be safe. ${FOOTER}\n`);
    process.exitCode = 2;
  }
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirectly) main();
