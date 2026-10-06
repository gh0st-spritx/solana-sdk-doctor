import type { Probe, ProbeResult } from "./types";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProbeContext {
  fetch: Fetcher;
  timeoutMs: number;
  rpcUrl: string;
  userAgent: string;
  registryUrl: string;
}

export const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

function expand(url: string, ctx: ProbeContext): string {
  return url.replace(/\{\{\s*rpcUrl\s*\}\}/g, ctx.rpcUrl);
}

function npmUrl(ctx: ProbeContext, pkg: string, version = "latest"): string {
  // Scoped names keep the "@" but encode the slash.
  return `${ctx.registryUrl.replace(/\/$/, "")}/${pkg.replace("/", "%2f")}/${encodeURIComponent(version)}`;
}

export function probeKey(probe: Probe, ctx: Pick<ProbeContext, "rpcUrl">): string {
  return JSON.stringify(probe).replace(/\{\{\s*rpcUrl\s*\}\}/g, ctx.rpcUrl);
}

async function timed(ctx: ProbeContext, url: string, init: RequestInit): Promise<{ res: Response; ms: number }> {
  const start = Date.now();
  const res = await ctx.fetch(url, {
    ...init,
    headers: { "user-agent": ctx.userAgent, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(ctx.timeoutMs),
  });
  return { res, ms: Date.now() - start };
}

export function describeTarget(probe: Probe, ctx: Pick<ProbeContext, "rpcUrl" | "registryUrl">): string {
  switch (probe.kind) {
    case "http":
      return `${probe.method ?? "GET"} ${probe.url}`;
    case "jsonrpc":
      return `RPC ${probe.method} @ ${probe.url.replace(/\{\{\s*rpcUrl\s*\}\}/g, ctx.rpcUrl)}`;
    case "npm-deprecated":
      return `npm deprecation ${probe.package}@${probe.version ?? "latest"}`;
    case "npm-published":
      return `npm ${probe.package}`;
  }
}

export async function runProbe(probe: Probe, ctx: ProbeContext): Promise<ProbeResult> {
  const target = describeTarget(probe, ctx);
  try {
    switch (probe.kind) {
      case "http": {
        const { res, ms } = await timed(ctx, expand(probe.url, ctx), {
          method: probe.method ?? "GET",
          headers: probe.headers,
          body: probe.body,
        });
        const body = (await res.text()).slice(0, 2000);
        const snippet = body.replace(/\s+/g, " ").trim().slice(0, 80);
        const detail = `HTTP ${res.status}${snippet ? ` "${snippet}"` : ""}`;
        const driftStatus = probe.driftWhen.status ?? [];
        if (driftStatus.includes(res.status) || (probe.driftWhen.bodyIncludes && body.includes(probe.driftWhen.bodyIncludes))) {
          return { state: "drift", detail, target, httpStatus: res.status, ms };
        }
        const healthy = probe.healthyWhen?.status ? probe.healthyWhen.status.includes(res.status) : res.status >= 200 && res.status < 300;
        return { state: healthy ? "healthy" : "inconclusive", detail, target, httpStatus: res.status, ms };
      }
      case "jsonrpc": {
        const { res, ms } = await timed(ctx, expand(probe.url, ctx), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: probe.method, params: probe.params ?? [] }),
        });
        let json: any;
        try {
          json = await res.json();
        } catch {
          return { state: "inconclusive", detail: `HTTP ${res.status}, non-JSON body`, target, httpStatus: res.status, ms };
        }
        const code = json?.error?.code;
        const message = typeof json?.error?.message === "string" ? json.error.message : "";
        const msgRe = probe.driftWhen.rpcErrorMessage ? new RegExp(probe.driftWhen.rpcErrorMessage, "i") : undefined;
        if (
          (typeof code === "number" && probe.driftWhen.rpcErrorCode.includes(code)) ||
          (json?.error && msgRe && msgRe.test(message))
        ) {
          return { state: "drift", detail: `${probe.method} -> ${code} "${json.error.message}"`, target, httpStatus: res.status, ms };
        }
        if (json && "result" in json) return { state: "healthy", detail: `${probe.method} -> result OK`, target, httpStatus: res.status, ms };
        return {
          state: "inconclusive",
          detail: code !== undefined ? `${probe.method} -> ${code} "${json.error?.message}"` : `HTTP ${res.status}`,
          target,
          httpStatus: res.status,
          ms,
        };
      }
      case "npm-deprecated": {
        const { res, ms } = await timed(ctx, npmUrl(ctx, probe.package, probe.version), {});
        if (res.status === 404) return { state: "inconclusive", detail: "package/version not found on npm", target, httpStatus: 404, ms };
        if (!res.ok) return { state: "inconclusive", detail: `HTTP ${res.status}`, target, httpStatus: res.status, ms };
        const doc: any = await res.json();
        if (doc.deprecated) return { state: "drift", detail: `npm deprecated ${doc.version}: "${String(doc.deprecated).slice(0, 140)}"`, target, httpStatus: res.status, ms };
        return { state: "healthy", detail: `${doc.version} not deprecated`, target, httpStatus: res.status, ms };
      }
      case "npm-published": {
        const { res, ms } = await timed(ctx, npmUrl(ctx, probe.package), {});
        if (res.ok) {
          const doc: any = await res.json();
          return { state: "drift", detail: `${probe.package}@${doc.version} is published`, target, httpStatus: res.status, ms };
        }
        if (res.status === 404) return { state: "healthy", detail: `${probe.package} not published`, target, httpStatus: 404, ms };
        return { state: "inconclusive", detail: `HTTP ${res.status}`, target, httpStatus: res.status, ms };
      }
    }
  } catch (e) {
    const err = e as Error;
    const reason = err.name === "TimeoutError" || err.name === "AbortError" ? `timeout after ${ctx.timeoutMs}ms` : err.message;
    return { state: "inconclusive", detail: `probe error: ${reason}`, target };
  }
}

/** Memoizes identical probes so a monorepo with 20 package.json files only hits each endpoint once. */
export function createProber(ctx: ProbeContext) {
  const cache = new Map<string, Promise<ProbeResult>>();
  return (probe: Probe): Promise<ProbeResult> => {
    const key = probeKey(probe, ctx);
    let p = cache.get(key);
    if (!p) {
      p = runProbe(probe, ctx);
      cache.set(key, p);
    }
    return p;
  };
}
