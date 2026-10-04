import type { ArgumentCheck, CodeCheck, CodeLocation } from "./types";
import type { SourceFile } from "./scanner";
import { maskSource, type Masked } from "./lexer";

/** Starting at `openIdx` (an opening paren), return the text up to the balanced closing paren. */
export function extractCall(text: string, openIdx: number, maxLen = 4000): string {
  const end = callEnd(text, openIdx, maxLen);
  return text.slice(openIdx, end);
}

/** Index just past the paren that balances the one at `openIdx` (or openIdx + maxLen if unbalanced). */
function callEnd(text: string, openIdx: number, maxLen = 4000): number {
  let depth = 0;
  for (let i = openIdx; i < text.length && i - openIdx < maxLen; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return Math.min(text.length, openIdx + maxLen);
}

interface Prepared extends Masked {
  raw: string;
  lineStarts: number[];
  lines: string[];
}

const cache = new WeakMap<SourceFile, Prepared>();

function prepare(f: SourceFile): Prepared {
  let p = cache.get(f);
  if (!p || p.raw !== f.content) {
    const lineStarts = [0];
    for (let i = 0; i < f.content.length; i++) if (f.content.charCodeAt(i) === 10) lineStarts.push(i + 1);
    p = { raw: f.content, ...maskSource(f.path, f.content), lineStarts, lines: f.content.split("\n") };
    cache.set(f, p);
  }
  return p;
}

function lineOf(p: Prepared, idx: number): number {
  let lo = 0;
  let hi = p.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (p.lineStarts[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const KEYWORDS = new Set([
  "new", "await", "async", "function", "return", "const", "let", "var", "true", "false", "null", "undefined", "this",
  "typeof", "void", "as", "satisfies", "in", "of", "process", "env", "require", "import",
]);

/**
 * Find the declaration `const|let|var NAME (: Type)? = <init>` closest before `before` (else the first one).
 * Returns the initializer span in file offsets, plus the declared type text if any.
 */
function findDeclaration(p: Prepared, name: string, before: number): { init: [number, number]; type?: string } | undefined {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(name)}\\s*(?::\\s*([^=;\\n]+?))?\\s*=(?!=)\\s*`, "g");
  let best: RegExpExecArray | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p.code))) {
    if (m.index < before || !best) best = m;
    if (m.index >= before) break;
  }
  if (!best) return undefined;
  const start = best.index + best[0].length;
  // Initializer ends at the first ";" or newline-at-depth-0 (outside literals), or the enclosing closer.
  let depth = 0;
  let end = start;
  for (; end < p.skeleton.length && end - start < 4000; end++) {
    const c = p.skeleton[end];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (c === ";" || c === ",")) break;
    else if (depth === 0 && c === "\n") {
      // A newline ends the statement unless the next line continues the expression (`.then(...)`, `?? x`, ...).
      let k = end + 1;
      while (k < p.skeleton.length && /\s/.test(p.skeleton[k])) k++;
      if (!/[.?:|&+\-*/]/.test(p.skeleton[k] ?? "x")) break;
    }
  }
  return { init: [start, end], type: best[1]?.trim() };
}

/** Identifiers referenced in a span (skipping member accesses `.foo`, object keys `foo:`, and keywords). */
function identifiersIn(p: Prepared, from: number, to: number): string[] {
  const span = p.skeleton.slice(from, to).replace(/\.\.\./g, "   "); // `{ ...opts }` references opts
  const out = new Set<string>();
  const re = /(?<![.\w$])[A-Za-z_$][\w$]*(?![\w$])(?!\s*:)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(span))) if (!KEYWORDS.has(m[0])) out.add(m[0]);
  return [...out];
}

/** Does the span (or any identifier it references, resolved to an in-file initializer) satisfy `re`? */
function spanSatisfies(p: Prepared, from: number, to: number, re: RegExp, depth = 0, seen = new Set<string>()): boolean {
  if (re.test(p.code.slice(from, to))) return true;
  if (depth >= 3) return false;
  for (const id of identifiersIn(p, from, to)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const decl = findDeclaration(p, id, from);
    if (decl && spanSatisfies(p, decl.init[0], decl.init[1], re, depth + 1, seen)) return true;
  }
  return false;
}

/** Find the "(" of the call expression that encloses `idx` (e.g. the fetch( around a URL literal). */
function enclosingCallOpen(p: Prepared, idx: number, maxBack = 3000): number {
  let depth = 0;
  for (let j = idx - 1; j >= 0 && idx - j < maxBack; j--) {
    const c = p.skeleton[j];
    if (c === ")") depth++;
    else if (c === "(") {
      if (depth === 0) return j;
      depth--;
    } else if (c === ";" && depth === 0) return -1;
  }
  return -1;
}

/**
 * Call-scoped mitigation: the fix must be visible in the call this match belongs to - its arguments, or an
 * options object / variable those arguments reference (resolved within the same file). A token mentioned
 * elsewhere in the file does NOT count.
 */
function callMitigated(p: Prepared, start: number, end: number, re: RegExp): boolean {
  // 1. The match itself is a call head, e.g. `new HermesClient(`.
  const after = p.skeleton.slice(end - 1, end + 3);
  const openIdx = p.skeleton[end - 1] === "(" ? end - 1 : /^.\s{0,2}\(/.test(after) ? p.skeleton.indexOf("(", end) : -1;
  if (openIdx >= 0) return spanSatisfies(p, openIdx, callEnd(p.skeleton, openIdx), re);

  // 2. The match sits inside a call's arguments, e.g. fetch("https://...", { headers }).
  const encl = enclosingCallOpen(p, start);
  if (encl >= 0) return spanSatisfies(p, encl, callEnd(p.skeleton, encl), re);

  // 3. The match initialises a variable/constant: every call that uses that name must be mitigated.
  const head = p.code.slice(Math.max(0, start - 400), start);
  const decl = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=(?!=)[^;]*$/.exec(head);
  if (!decl) return re.test(p.code.slice(start, end));
  const name = decl[1];
  const uses = new RegExp(`(?<![.\\w$])${escapeRe(name)}(?![\\w$])`, "g");
  let used = 0;
  let u: RegExpExecArray | null;
  while ((u = uses.exec(p.skeleton))) {
    if (u.index >= start - head.length + decl.index && u.index <= end) continue; // the declaration itself
    const open = enclosingCallOpen(p, u.index);
    if (open < 0) continue;
    used++;
    if (!spanSatisfies(p, open, callEnd(p.skeleton, open), re)) return false;
  }
  return used > 0;
}

const STRING_LITERAL = /^(["'`])[\s\S]*\1$/;

/** Argument filter: keep the match only if the captured argument is (very likely) of the targeted kind. */
function argumentMatches(p: Prepared, arg: string | undefined, at: number, spec: ArgumentCheck): boolean {
  if (arg === undefined) return true;
  const a = arg.trim();
  if (STRING_LITERAL.test(a)) return spec.literals !== false;
  if (!/^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/.test(a)) return false;
  const segments = a.split(/\??\./);
  const leaf = segments[segments.length - 1];
  const decl = segments.length === 1 ? findDeclaration(p, a, at) : undefined;
  const init = decl ? p.code.slice(decl.init[0], decl.init[1]).trim() : undefined;
  // An object/array literal is never a bare signature string, whatever the variable is called.
  if (init && /^[{[]/.test(init)) return false;
  if (spec.names && new RegExp(spec.names, "i").test(leaf)) return true;
  if (init && spec.assignedFrom && new RegExp(spec.assignedFrom).test(init)) return true;
  if (spec.types) {
    const typeRe = new RegExp(`^(?:${spec.types})$`);
    if (decl?.type && typeRe.test(decl.type)) return true;
    if (segments.length === 1) {
      const param = new RegExp(`(?<![.\\w$])${escapeRe(a)}\\??\\s*:\\s*([A-Za-z_$][\\w$.<>]*)`, "g");
      let m: RegExpExecArray | null;
      while ((m = param.exec(p.code))) if (typeRe.test(m[1])) return true;
    }
  }
  return false;
}

export function findMatches(check: CodeCheck, files: SourceFile[]): CodeLocation[] {
  const flags = Array.from(new Set(((check.flags ?? "") + "g").split(""))).join("");
  const mitigation = check.mitigatedBy ? new RegExp(check.mitigatedBy) : undefined;
  const out: CodeLocation[] = [];
  for (const f of files) {
    const p = prepare(f);
    const text = check.includeComments ? p.raw : p.code;
    const view: Prepared = check.includeComments ? { ...p, code: p.raw } : p;
    const re = new RegExp(check.pattern, flags);
    const fileMitigated = !!mitigation && check.mitigationScope === "file" && mitigation.test(view.code);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (check.argument && !argumentMatches(view, m.groups?.[check.argument.group], m.index, check.argument)) continue;
      const line = lineOf(p, m.index);
      const lineText = p.lines[line - 1] ?? "";
      let mitigated = fileMitigated;
      if (mitigation && !mitigated && check.mitigationScope !== "file") {
        mitigated = callMitigated(view, m.index, m.index + m[0].length, mitigation);
      }
      out.push({ file: f.path, line, snippet: lineText.trim().slice(0, 160), mitigated });
    }
  }
  return out;
}
