/**
 * RPC provider selection for live probes and on-chain checks.
 *
 * Resolution order for the endpoint:
 *   1. Explicit `--rpc` / `--rpc-url` CLI value (URL or the keyword `solami`)
 *   2. `SOLAMI_API_KEY` env → Solami mainnet RPC
 *   3. `SOLANA_RPC_URL` env
 *   4. Public Solana mainnet-beta
 *
 * API keys are never returned in cleartext by `displayUrl` / `redactSecrets`.
 */

import { DEFAULT_RPC_URL, type Fetcher } from "./probes";

export const SOLAMI_RPC_BASE = "https://rpc.solami.dev/sol";
export const SOLAMI_WS_BASE = "wss://ws.solami.dev/ws/sol";
export const SOLAMI_DATA_API = "https://api.solami.dev";

export type RpcProviderKind = "solami" | "public" | "custom";

export interface RpcProvider {
  kind: RpcProviderKind;
  /** Full URL including credentials (for actual requests). Never log this. */
  url: string;
  /** Safe-to-print URL with secrets redacted. */
  displayUrl: string;
  label: string;
}

export class RpcConfigError extends Error {}

/** Redact api_key / access_token / similar query params and Bearer tokens. */
export function redactSecrets(text: string): string {
  return text
    .replace(/([?&](?:api[_-]?key|access[_-]?token|token|key)=)[^&\s"'`]+/gi, "$1***")
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, "$1***")
    .replace(/\bsk_[A-Za-z0-9_-]{8,}\b/g, "sk_***");
}

export function solamiRpcUrl(apiKey: string, region?: string): string {
  const key = apiKey.trim();
  if (!key) throw new RpcConfigError("SOLAMI_API_KEY is empty");
  const host = region ? `https://${region}.rpc.solami.dev/sol` : SOLAMI_RPC_BASE;
  return `${host}?api_key=${encodeURIComponent(key)}`;
}

export interface ResolveRpcOptions {
  /** Raw CLI `--rpc` / `--rpc-url` value: absolute URL or `solami`. */
  rpc?: string;
  env?: NodeJS.ProcessEnv;
  /** Optional Solami region pin (nyc | ams | fra). */
  solamiRegion?: string;
}

/**
 * Resolve which RPC endpoint to use. Throws RpcConfigError when `solami` is
 * requested but no key is available.
 */
export function resolveRpcProvider(opts: ResolveRpcOptions = {}): RpcProvider {
  const env = opts.env ?? process.env;
  const raw = (opts.rpc ?? "").trim();
  const solamiKey = (env.SOLAMI_API_KEY ?? "").trim();
  const envRpc = (env.SOLANA_RPC_URL ?? "").trim();

  const asSolami = (): RpcProvider => {
    if (!solamiKey) {
      throw new RpcConfigError(
        "Solami RPC requested but SOLAMI_API_KEY is not set. Get a key at https://solami.dev/signup then export SOLAMI_API_KEY=…",
      );
    }
    const url = solamiRpcUrl(solamiKey, opts.solamiRegion);
    return {
      kind: "solami",
      url,
      displayUrl: redactSecrets(url),
      label: "solami",
    };
  };

  if (raw) {
    if (/^solami$/i.test(raw)) return asSolami();
    if (!/^https?:\/\//i.test(raw)) {
      throw new RpcConfigError(`--rpc must be an http(s) URL or the keyword "solami" (got "${raw}")`);
    }
    const kind: RpcProviderKind = /rpc\.solami\.dev/i.test(raw)
      ? "solami"
      : /api\.mainnet-beta\.solana\.com/i.test(raw)
        ? "public"
        : "custom";
    return { kind, url: raw, displayUrl: redactSecrets(raw), label: kind === "public" ? "public-mainnet" : kind };
  }

  if (solamiKey) return asSolami();
  if (envRpc) {
    return {
      kind: /rpc\.solami\.dev/i.test(envRpc) ? "solami" : "custom",
      url: envRpc,
      displayUrl: redactSecrets(envRpc),
      label: /rpc\.solami\.dev/i.test(envRpc) ? "solami" : "custom",
    };
  }
  return {
    kind: "public",
    url: DEFAULT_RPC_URL,
    displayUrl: DEFAULT_RPC_URL,
    label: "public-mainnet",
  };
}

export interface RpcHeader {
  provider: string;
  url: string;
  slot?: number;
  latencyMs?: number;
  detail?: string;
}

/** Fetch getSlot for the report header. Failures are soft (header still prints). */
export async function probeRpcHeader(
  provider: RpcProvider,
  opts: { fetch: Fetcher; timeoutMs: number; userAgent: string },
): Promise<RpcHeader> {
  const header: RpcHeader = { provider: provider.label, url: provider.displayUrl };
  const start = Date.now();
  try {
    const res = await opts.fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": opts.userAgent },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    header.latencyMs = Date.now() - start;
    if (!res.ok) {
      header.detail = `HTTP ${res.status}`;
      return header;
    }
    const json: any = await res.json();
    if (typeof json?.result === "number") header.slot = json.result;
    else if (json?.error) header.detail = redactSecrets(`${json.error.code} ${json.error.message ?? ""}`.trim());
    else header.detail = "unexpected getSlot response";
  } catch (e) {
    header.latencyMs = Date.now() - start;
    const err = e as Error;
    header.detail = err.name === "TimeoutError" || err.name === "AbortError" ? `timeout after ${opts.timeoutMs}ms` : redactSecrets(err.message);
  }
  return header;
}
