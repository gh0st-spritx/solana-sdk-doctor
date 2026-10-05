/**
 * On-chain address drift: batch-query extracted pubkeys via getMultipleAccounts
 * and emit findings for missing/closed accounts, non-executable program IDs,
 * owner mismatches vs a small known table, and known-devnet addresses on mainnet.
 *
 * Timeouts / rate limits → inconclusive (never fail).
 */

import type { ExtractedAddress } from "./addresses";
import { groupByPubkey } from "./addresses";
import { redactSecrets, type RpcProvider } from "./rpc";
import type { Fetcher } from "./probes";
import type { CodeLocation, Finding, Severity } from "./types";

export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
export const BPF_LOADER_2 = "BPFLoader2111111111111111111111111111111111";
export const NATIVE_LOADER = "NativeLoader1111111111111111111111111111111";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
export const METAPLEX_TOKEN_METADATA = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const PYTH_ORACLE_MAINNET = "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH";
export const PYTH_ORACLE_DEVNET = "gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s";
export const PYTH_SOLANA_RECEIVER = "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ";
export const PYTH_PUSH_ORACLE = "pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT";
export const WORMHOLE_CORE = "HDwcJBJXjL9FpJ7UBsYBtaDjsBUhuLCUYoz3zr8SWWaQ";

const LOADER_OWNERS = new Set([BPF_UPGRADEABLE_LOADER, BPF_LOADER_2, NATIVE_LOADER]);

export interface KnownProgram {
  address: string;
  name: string;
  /** Expected owner (loader for programs, or hosting program for PDAs/feeds). */
  expectedOwner: string;
  cluster?: "mainnet" | "devnet" | "any";
}

/** Small curated table of well-known Solana / oracle programs. */
export const KNOWN_PROGRAMS: KnownProgram[] = [
  { address: SYSTEM_PROGRAM, name: "System Program", expectedOwner: NATIVE_LOADER, cluster: "any" },
  { address: TOKEN_PROGRAM, name: "SPL Token", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
  { address: TOKEN_2022_PROGRAM, name: "Token-2022", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
  { address: ASSOCIATED_TOKEN, name: "Associated Token Account", expectedOwner: BPF_LOADER_2, cluster: "any" },
  { address: MEMO_PROGRAM, name: "Memo", expectedOwner: BPF_LOADER_2, cluster: "any" },
  { address: COMPUTE_BUDGET, name: "Compute Budget", expectedOwner: NATIVE_LOADER, cluster: "any" },
  { address: METAPLEX_TOKEN_METADATA, name: "Metaplex Token Metadata", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
  { address: PYTH_ORACLE_MAINNET, name: "Pyth Oracle (legacy push)", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "mainnet" },
  { address: PYTH_ORACLE_DEVNET, name: "Pyth Oracle (devnet)", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "devnet" },
  { address: PYTH_SOLANA_RECEIVER, name: "Pyth Solana Receiver", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
  { address: PYTH_PUSH_ORACLE, name: "Pyth Push Oracle", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
  { address: WORMHOLE_CORE, name: "Wormhole Core Bridge (Pyth)", expectedOwner: BPF_UPGRADEABLE_LOADER, cluster: "any" },
];

const KNOWN_BY_ADDR = new Map(KNOWN_PROGRAMS.map((k) => [k.address, k]));

/** Addresses that should not be used against mainnet (exist only / primarily on other clusters). */
export const DEVNET_ONLY = new Set([
  PYTH_ORACLE_DEVNET,
  // Classic Anchor tutorial keypair often used as a fake program id in examples:
  // (kept out of DEVNET_ONLY — handled as non-executable program instead)
]);

export interface AccountInfo {
  executable: boolean;
  owner: string;
  lamports: number;
  space?: number;
}

export type AccountLookup = "ok" | "missing" | "inconclusive";

export interface AccountResult {
  pubkey: string;
  lookup: AccountLookup;
  info?: AccountInfo;
  detail: string;
}

export interface OnChainRuleMeta {
  id: string;
  severity: Severity;
  title: string;
  summary: string;
  fix: string;
  docs: string[];
}

export const ONCHAIN_RULES: OnChainRuleMeta[] = [
  {
    id: "ONCHAIN-ACCOUNT-MISSING",
    severity: "fail",
    title: "Hard-coded account missing or closed on-chain",
    summary:
      "A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.",
    fix: "Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.",
    docs: ["https://solana.com/docs/rpc/http/getmultipleaccounts"],
  },
  {
    id: "ONCHAIN-PROGRAM-NOT-EXECUTABLE",
    severity: "fail",
    title: "Hard-coded program ID is not executable on-chain",
    summary:
      "A pubkey used as a program ID (PublicKey passed to Program / named PROGRAM_ID / similar) exists but executable=false. Calling it as a program will fail at runtime.",
    fix: "Use the deployed program id for this cluster (check `solana program show` / the project's Anchor declare_id / IDL address).",
    docs: ["https://solana.com/docs/rpc/http/getaccountinfo"],
  },
  {
    id: "ONCHAIN-OWNER-MISMATCH",
    severity: "warn",
    title: "Account owner does not match the known program table",
    summary:
      "A well-known program/oracle address was found, but its on-chain owner differs from the expected loader/host program. This often means a renamed deployment or a wrong-cluster address that still exists.",
    fix: "Confirm the address against current docs (Pyth / SPL / Metaplex) and update the constant.",
    docs: [
      "https://docs.pyth.network/price-feeds/core/contract-addresses/solana",
      "https://spl.solana.com/token",
    ],
  },
  {
    id: "ONCHAIN-DEVNET-ON-MAINNET",
    severity: "warn",
    title: "Known devnet-only address used in a mainnet context",
    summary:
      "Source hard-codes an address that is documented as devnet-only (e.g. Pyth's devnet oracle program), while the doctor is probing a mainnet RPC.",
    fix: "Switch to the mainnet program id, or select addresses from a cluster map keyed by the active RPC.",
    docs: ["https://docs.pyth.network/price-feeds/core/contract-addresses/solana"],
  },
];

export const ONCHAIN_RULE_IDS = new Set(ONCHAIN_RULES.map((r) => r.id));

const BATCH = 100; // getMultipleAccounts hard limit is 100

export interface OnChainContext {
  fetch: Fetcher;
  timeoutMs: number;
  userAgent: string;
  provider: RpcProvider;
  /** Treat the RPC as mainnet for DEVNET_ONLY checks. Default: auto from provider. */
  isMainnet?: boolean;
}

function looksMainnet(provider: RpcProvider): boolean {
  if (provider.kind === "solami" || provider.kind === "public") return true;
  return /mainnet/i.test(provider.url) && !/devnet|testnet|localhost|127\.0\.0\.1/i.test(provider.url);
}

async function rpcCall(ctx: OnChainContext, method: string, params: unknown[]): Promise<{ ok: true; result: any; ms: number } | { ok: false; detail: string; ms: number }> {
  const start = Date.now();
  try {
    const res = await ctx.fetch(ctx.provider.url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": ctx.userAgent },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
    const ms = Date.now() - start;
    if (res.status === 429 || res.status >= 500) {
      return { ok: false, detail: `HTTP ${res.status}`, ms };
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      return { ok: false, detail: `HTTP ${res.status}, non-JSON`, ms };
    }
    if (json?.error) {
      const code = json.error.code;
      // -32005 / -32429 often rate-limit; treat as inconclusive
      if (code === -32005 || code === -32429 || res.status === 429) {
        return { ok: false, detail: redactSecrets(`${code} ${json.error.message ?? "rate limited"}`), ms };
      }
      return { ok: false, detail: redactSecrets(`${code} ${json.error.message ?? ""}`.trim()), ms };
    }
    return { ok: true, result: json.result, ms };
  } catch (e) {
    const err = e as Error;
    const reason = err.name === "TimeoutError" || err.name === "AbortError" ? `timeout after ${ctx.timeoutMs}ms` : err.message;
    return { ok: false, detail: redactSecrets(reason), ms: Date.now() - start };
  }
}

/** Batch getMultipleAccounts. Inconclusive entries stay lookup="inconclusive". */
export async function fetchAccounts(pubkeys: string[], ctx: OnChainContext): Promise<Map<string, AccountResult>> {
  const out = new Map<string, AccountResult>();
  if (pubkeys.length === 0) return out;

  for (let i = 0; i < pubkeys.length; i += BATCH) {
    const chunk = pubkeys.slice(i, i + BATCH);
    const resp = await rpcCall(ctx, "getMultipleAccounts", [chunk, { encoding: "base64" }]);
    if (!resp.ok) {
      for (const pk of chunk) {
        out.set(pk, { pubkey: pk, lookup: "inconclusive", detail: `getMultipleAccounts inconclusive: ${resp.detail}` });
      }
      continue;
    }
    const values: Array<any | null> = resp.result?.value ?? [];
    for (let j = 0; j < chunk.length; j++) {
      const pk = chunk[j];
      const acc = values[j];
      if (acc == null) {
        out.set(pk, { pubkey: pk, lookup: "missing", detail: "account null (missing or closed)" });
      } else {
        out.set(pk, {
          pubkey: pk,
          lookup: "ok",
          info: {
            executable: !!acc.executable,
            owner: String(acc.owner),
            lamports: Number(acc.lamports) || 0,
            space: typeof acc.space === "number" ? acc.space : undefined,
          },
          detail: `owner=${acc.owner} executable=${!!acc.executable}`,
        });
      }
    }
  }
  return out;
}

function locationsOf(hits: ExtractedAddress[]): CodeLocation[] {
  return hits.map((h) => ({ file: h.file, line: h.line, snippet: h.snippet, mitigated: false }));
}

function finding(
  rule: OnChainRuleMeta,
  hits: ExtractedAddress[],
  note: string,
  probeDetail: string,
  target: string,
): Finding {
  return {
    ruleId: rule.id,
    manifest: "package.json",
    status: rule.severity,
    severity: rule.severity,
    title: rule.title,
    summary: rule.summary,
    fix: rule.fix,
    docs: rule.docs,
    note,
    locations: locationsOf(hits),
    probe: { source: "live", state: "drift", detail: probeDetail, target },
  };
}

function meta(id: string): OnChainRuleMeta {
  return ONCHAIN_RULES.find((r) => r.id === id)!;
}

/**
 * Run on-chain address drift checks. Returns findings (possibly empty).
 * Never throws; RPC problems become notes on an info-less skip (no findings).
 */
export async function checkOnChainAddresses(
  hits: ExtractedAddress[],
  ctx: OnChainContext,
): Promise<{ findings: Finding[]; queried: number; inconclusive: boolean; detail?: string }> {
  if (hits.length === 0) return { findings: [], queried: 0, inconclusive: false };

  const grouped = groupByPubkey(hits);
  const pubkeys = [...grouped.keys()];
  const accounts = await fetchAccounts(pubkeys, ctx);

  const anyInconclusive = [...accounts.values()].some((a) => a.lookup === "inconclusive");
  if (anyInconclusive && [...accounts.values()].every((a) => a.lookup === "inconclusive")) {
    return {
      findings: [],
      queried: pubkeys.length,
      inconclusive: true,
      detail: accounts.values().next().value?.detail,
    };
  }

  const mainnet = ctx.isMainnet ?? looksMainnet(ctx.provider);
  const target = `getMultipleAccounts @ ${ctx.provider.displayUrl}`;
  const findings: Finding[] = [];
  const ruleMissing = meta("ONCHAIN-ACCOUNT-MISSING");
  const ruleExec = meta("ONCHAIN-PROGRAM-NOT-EXECUTABLE");
  const ruleOwner = meta("ONCHAIN-OWNER-MISMATCH");
  const ruleDevnet = meta("ONCHAIN-DEVNET-ON-MAINNET");

  for (const [pk, locs] of grouped) {
    const acc = accounts.get(pk);
    if (!acc || acc.lookup === "inconclusive") continue;

    const kinds = new Set(locs.map((l) => l.kind));
    const treatAsProgram = kinds.has("program") || KNOWN_BY_ADDR.has(pk);

    if (mainnet && (DEVNET_ONLY.has(pk) || KNOWN_BY_ADDR.get(pk)?.cluster === "devnet")) {
      findings.push(
        finding(
          ruleDevnet,
          locs,
          `${pk.slice(0, 8)}… is documented for devnet; RPC provider is ${ctx.provider.label}`,
          `${pk} flagged as devnet-only while probing ${ctx.provider.label}`,
          target,
        ),
      );
    }

    if (acc.lookup === "missing") {
      findings.push(
        finding(ruleMissing, locs, `${pk} → null on ${ctx.provider.label}`, `${pk} → null (missing/closed)`, target),
      );
      continue;
    }

    const info = acc.info!;
    if (treatAsProgram && !info.executable) {
      findings.push(
        finding(
          ruleExec,
          locs,
          `${pk} owner=${info.owner} executable=false`,
          `${pk} → executable=false (owner ${info.owner})`,
          target,
        ),
      );
    }

    const known = KNOWN_BY_ADDR.get(pk);
    if (known && info.owner !== known.expectedOwner) {
      // Loader migrations (BPFLoader2 → Upgradeable) are fine; only warn on a clearly wrong owner.
      const bothLoaders = LOADER_OWNERS.has(info.owner) && LOADER_OWNERS.has(known.expectedOwner);
      if (!bothLoaders) {
        findings.push(
          finding(
            ruleOwner,
            locs,
            `${known.name}: expected owner ${known.expectedOwner}, got ${info.owner}`,
            `${pk} (${known.name}) owner=${info.owner}, expected ${known.expectedOwner}`,
            target,
          ),
        );
      }
    }
  }

  return { findings, queried: pubkeys.length, inconclusive: anyInconclusive };
}

/** Disable filter: honour --disable for on-chain rule ids. */
export function filterOnChainFindings(findings: Finding[], disabled: Set<string>): Finding[] {
  return findings.filter((f) => !disabled.has(f.ruleId));
}
