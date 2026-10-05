/**
 * Extract hard-coded Solana base58 pubkeys from scanned sources.
 * Comment-aware (uses the same lexer as code matching). Strict enough to avoid
 * random strings: requires PublicKey(...) / named constants / IDL-style address fields,
 * plus a 32-byte base58 decode.
 */

import { maskSource } from "./lexer";
import type { SourceFile } from "./scanner";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = (() => {
  const m = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE58_ALPHABET.length; i++) m[BASE58_ALPHABET.charCodeAt(i)] = i;
  return m;
})();

/** Decode base58 → bytes. Throws on invalid charset. */
export function decodeBase58(str: string): Uint8Array {
  if (!str) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const size = (((str.length - zeros) * 733) / 1000 + 1) | 0; // log(58)/log(256)
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < str.length; i++) {
    const c = str.charCodeAt(i);
    let carry = c < 128 ? BASE58_MAP[c] : -1;
    if (carry < 0) throw new Error("invalid base58");
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * buf[k];
      buf[k] = carry & 0xff;
      carry >>= 8;
    }
    length = j;
  }
  let start = size - length;
  while (start < size && buf[start] === 0) start++;
  const out = new Uint8Array(zeros + (size - start));
  out.fill(0, 0, zeros);
  out.set(buf.subarray(start), zeros);
  return out;
}

/** True iff `s` is a valid 32-byte Solana pubkey encoded in base58. */
export function isValidPubkey(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  try {
    return decodeBase58(s).length === 32;
  } catch {
    return false;
  }
}

export type AddressKind = "program" | "account" | "feed" | "unknown";

export interface ExtractedAddress {
  pubkey: string;
  file: string;
  line: number;
  snippet: string;
  kind: AddressKind;
  /** Binding / constant name if extracted from a named declaration. */
  name?: string;
}

const PUBKEY_RE =
  /(?:new\s+(?:[\w$.]+\.)?PublicKey\s*\(\s*|PublicKey\s*\.\s*from\s*\(\s*)(["'`])([1-9A-HJ-NP-Za-km-z]{32,44})\1\s*\)/g;

const NAMED_CONST_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:new\s+(?:[\w$.]+\.)?PublicKey\s*\(\s*)?(["'`])([1-9A-HJ-NP-Za-km-z]{32,44})\2/g;

const ADDRESS_FIELD_RE =
  /(?:["']address["']|address)\s*[:=]\s*(["'`])([1-9A-HJ-NP-Za-km-z]{32,44})\1/g;

const CLUSTER_MAP_RE =
  /(?:mainnet-beta|devnet|testnet|pythnet|localnet)\s*["']?\s*:\s*(["'`])([1-9A-HJ-NP-Za-km-z]{32,44})\1/gi;

const NAME_PROGRAM = /program|prog_?id|pid\b/i;
const NAME_FEED = /feed|price|oracle|product/i;
const NAME_ACCOUNT = /account|mint|vault|authority|wallet|treasury|escrow|ata\b/i;
const NAME_INTERESTING = /program|account|address|pubkey|public_?key|feed|oracle|price|mint|authority|vault|treasury|escrow|receiver|push|idl/i;

function classify(name: string | undefined, nearby: string): AddressKind {
  const lhs =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:new\s+)?(?:[\w$.]*\.)?PublicKey\b/.exec(nearby)?.[1] ??
    "";
  const n = name || lhs;
  if (NAME_PROGRAM.test(n) || /\bnew\s+(?:[\w$.]+\.)?Program\b/.test(nearby) || /\.programId\b/.test(nearby)) return "program";
  if (NAME_FEED.test(n)) return "feed";
  if (NAME_ACCOUNT.test(n)) return "account";
  if (/\bprogramId\b|\bPROGRAM_ID\b/.test(nearby)) return "program";
  return "unknown";
}

function lineOf(content: string, idx: number): { line: number; text: string } {
  let line = 1;
  let start = 0;
  for (let i = 0; i < idx && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      line++;
      start = i + 1;
    }
  }
  const end = content.indexOf("\n", idx);
  return { line, text: content.slice(start, end < 0 ? content.length : end) };
}

function pushUnique(
  out: ExtractedAddress[],
  seen: Set<string>,
  hit: ExtractedAddress,
): void {
  const key = `${hit.file}:${hit.line}:${hit.pubkey}`;
  if (!isValidPubkey(hit.pubkey)) return;
  if (seen.has(key)) {
    const existing = out.find((h) => h.file === hit.file && h.line === hit.line && h.pubkey === hit.pubkey);
    if (existing) {
      if (hit.name && !existing.name) existing.name = hit.name;
      if (hit.kind !== "unknown" && existing.kind === "unknown") existing.kind = hit.kind;
      if (hit.kind === "program") existing.kind = "program";
    }
    return;
  }
  seen.add(key);
  out.push(hit);
}

/** Extract hard-coded pubkeys from source files (comments skipped via lexer). */
export function extractAddresses(files: SourceFile[]): ExtractedAddress[] {
  const out: ExtractedAddress[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    const { code } = maskSource(f.path, f.content);
    const add = (pubkey: string, index: number, name?: string) => {
      const { line, text } = lineOf(f.content, index);
      const nearby = code.slice(Math.max(0, index - 120), Math.min(code.length, index + pubkey.length + 80));
      const kind = classify(name, nearby);
      const inferred =
        name ||
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*(?:new\s+)?(?:[\w$.]*\.)?PublicKey\b/.exec(nearby)?.[1];
      pushUnique(out, seen, {
        pubkey,
        file: f.path,
        line,
        snippet: text.trim().slice(0, 160),
        kind,
        name: inferred,
      });
    };

    for (const re of [PUBKEY_RE, NAMED_CONST_RE, ADDRESS_FIELD_RE, CLUSTER_MAP_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        // Group layout differs per regex; pubkey is always the last capture.
        const pubkey = m[m.length - 1];
        const name = re === NAMED_CONST_RE ? m[1] : undefined;
        // Named-const filter: skip boring locals like `const x = "…"`.
        if (re === NAMED_CONST_RE && name && !NAME_INTERESTING.test(name)) continue;
        add(pubkey, m.index, name);
      }
    }
  }

  return out;
}

/** Deduplicate by pubkey, keeping all evidence locations. */
export function groupByPubkey(hits: ExtractedAddress[]): Map<string, ExtractedAddress[]> {
  const map = new Map<string, ExtractedAddress[]>();
  for (const h of hits) {
    const list = map.get(h.pubkey) ?? [];
    list.push(h);
    map.set(h.pubkey, list);
  }
  return map;
}
