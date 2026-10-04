/**
 * Lightweight, length-preserving source masking. Matching runs on masked text so that
 * offsets and line numbers still point at the original file.
 *
 *  - `code`:     comments blanked (string/template/regex literals kept) - what rules match against.
 *  - `skeleton`: comments AND literal contents blanked (quotes kept) - used for paren/brace structure,
 *                so a "(" inside a string or comment never unbalances a call.
 *
 * Not a full parser: it is a single-pass tokenizer that understands //, /* *\/, '', "", template
 * literals with nested ${...}, and regex literals (via the usual "previous significant token" heuristic).
 */

export interface Masked {
  code: string;
  skeleton: string;
}

const JS_EXT = /\.(?:[cm]?[jt]sx?)$/i;
const MD_EXT = /\.mdx?$/i;
const SFC_EXT = /\.(?:vue|svelte)$/i;
const JS_FENCE_LANG = /^(?:js|jsx|ts|tsx|javascript|typescript|mjs|cjs|mts|cts)$/i;

const REGEX_AFTER_WORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);
const WORD = /[A-Za-z0-9_$]/;

function blankRange(arr: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (arr[i] !== "\n" && arr[i] !== "\r") arr[i] = " ";
}

/** Mask a JavaScript/TypeScript source string. */
export function maskJs(src: string): Masked {
  const n = src.length;
  const code = src.split("");
  const skel = src.split("");
  const tmplStack: number[] = [];
  let braceDepth = 0;
  // Last significant token: "" (start), a punctuation char, a word, or "lit" (end of a literal / identifier-like value).
  let last = "";
  let i = 0;

  const regexAllowed = () =>
    last === "" || (last.length === 1 && !WORD.test(last) && last !== ")" && last !== "]" && last !== "}") || REGEX_AFTER_WORD.has(last);

  // Lex template literal text starting at j (just after ` or the } closing a ${}). Returns index after the literal chunk.
  const templateChunk = (j: number): number => {
    while (j < n) {
      const ch = src[j];
      if (ch === "\\") {
        blankRange(skel, j, Math.min(n, j + 2));
        j += 2;
        continue;
      }
      if (ch === "`") {
        last = "lit";
        return j + 1;
      }
      if (ch === "$" && src[j + 1] === "{") {
        tmplStack.push(braceDepth);
        last = "{";
        return j + 2;
      }
      blankRange(skel, j, j + 1);
      j++;
    }
    return j;
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && src[j] !== "\n") j++;
      blankRange(code, i, j);
      blankRange(skel, i, j);
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      blankRange(code, i, stop);
      blankRange(skel, i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      blankRange(skel, i + 1, Math.min(j, n));
      i = j + 1;
      last = "lit";
      continue;
    }
    if (c === "`") {
      i = templateChunk(i + 1);
      continue;
    }
    if (c === "}" && tmplStack.length && tmplStack[tmplStack.length - 1] === braceDepth) {
      tmplStack.pop();
      i = templateChunk(i + 1);
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== "\n") {
        const ch = src[j];
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) break;
        j++;
      }
      blankRange(skel, i + 1, Math.min(j, n));
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      i = j;
      last = "lit";
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (WORD.test(c)) {
      let j = i + 1;
      while (j < n && WORD.test(src[j])) j++;
      const word = src.slice(i, j);
      last = REGEX_AFTER_WORD.has(word) ? word : "lit";
      i = j;
      continue;
    }
    if (c === "{") braceDepth++;
    else if (c === "}") braceDepth--;
    last = c;
    i++;
  }
  return { code: code.join(""), skeleton: skel.join("") };
}

/**
 * Markdown: prose and fenced code are matched as written (docs that teach a dead API are findings too),
 * but inside JS/TS-tagged fences comments are masked, so `// old: getRecentBlockhash()` is not a hit.
 */
export function maskMarkdown(src: string): Masked {
  const code = src.split("");
  const skel = src.split("");
  let offset = 0;
  let fence: { char: string; len: number; lang: string; bodyStart: number } | null = null;
  for (const line of src.split("\n")) {
    const lineEnd = offset + line.length;
    if (!fence) {
      const open = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)/.exec(line);
      if (open) fence = { char: open[1][0], len: open[1].length, lang: open[2] ?? "", bodyStart: lineEnd + 1 };
    } else if (new RegExp(`^\\s{0,3}\\${fence.char}{${fence.len},}\\s*$`).test(line)) {
      if (JS_FENCE_LANG.test(fence.lang) && offset > fence.bodyStart) {
        const body = src.slice(fence.bodyStart, offset);
        const m = maskJs(body);
        for (let k = 0; k < body.length; k++) {
          code[fence.bodyStart + k] = m.code[k];
          skel[fence.bodyStart + k] = m.skeleton[k];
        }
      }
      fence = null;
    }
    offset = lineEnd + 1;
  }
  return { code: code.join(""), skeleton: skel.join("") };
}

/** Vue / Svelte single-file components: JS masking inside <script> blocks, template left as-is. */
export function maskSfc(src: string): Masked {
  const code = src.split("");
  const skel = src.split("");
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].indexOf(">") + 1;
    const body = m[1];
    const masked = maskJs(body);
    for (let k = 0; k < body.length; k++) {
      code[start + k] = masked.code[k];
      skel[start + k] = masked.skeleton[k];
    }
  }
  return { code: code.join(""), skeleton: skel.join("") };
}

/** Pick the masking strategy for a file path. Unknown extensions are matched raw. */
export function maskSource(path: string, src: string): Masked {
  if (JS_EXT.test(path)) return maskJs(src);
  if (MD_EXT.test(path)) return maskMarkdown(src);
  if (SFC_EXT.test(path)) return maskSfc(src);
  return { code: src, skeleton: src };
}
