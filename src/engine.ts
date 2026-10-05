import { resolve } from "node:path";
import semver from "semver";
import { extractAddresses } from "./addresses";
import { findMatches } from "./code";
import { checkOnChainAddresses, filterOnChainFindings, ONCHAIN_RULES } from "./onchain";
import { createProber, DEFAULT_REGISTRY, type Fetcher, describeTarget } from "./probes";
import { probeRpcHeader, resolveRpcProvider, type RpcProvider, type ResolveRpcOptions } from "./rpc";
import { scan, type Manifest, type SourceFile } from "./scanner";
import { TOOL_NAME, TOOL_VERSION } from "./version";
import type { DetectedPackage, Finding, ProbeOutcome, Report, Rule, Status } from "./types";

export interface DiagnoseOptions {
  rules: Rule[];
  offline?: boolean;
  timeoutMs?: number;
  /** Explicit RPC URL or the keyword `solami`. Prefer `rpc` going forward. */
  rpcUrl?: string;
  /** Same as rpcUrl; accepts `solami` or an http(s) URL. */
  rpc?: string;
  /** Env used for SOLAMI_API_KEY / SOLANA_RPC_URL resolution (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Pre-resolved provider (tests). */
  provider?: RpcProvider;
  registryUrl?: string;
  fetch?: Fetcher;
  /** Pre-scanned manifests (tests); otherwise `root` is scanned from disk. */
  manifests?: Manifest[];
  now?: () => Date;
  /** Skip on-chain address drift (default: run in live mode). */
  skipOnChain?: boolean;
  /** Rule ids disabled via --disable (also applied to on-chain family). */
  disabled?: string[];
}

export function versionMatches(version: string | undefined, range = "*"): boolean {
  if (range === "*" || range === "") return true;
  if (!version) return true; // unknown version: be conservative and report
  return semver.satisfies(version, range, { includePrerelease: true });
}

/** Packages any rule cares about - used to print a "pass" row for clean known SDKs. */
export function knownPackages(rules: Rule[]): Set<string> {
  return new Set(rules.map((r) => r.package).filter((p): p is string => !!p));
}

export async function diagnose(root: string, opts: DiagnoseOptions): Promise<Report> {
  const absRoot = resolve(root);
  const manifests = opts.manifests ?? scan(absRoot);

  const provider =
    opts.provider ??
    resolveRpcProvider({
      rpc: opts.rpc ?? opts.rpcUrl,
      env: opts.env ?? process.env,
    });

  const ctx = {
    fetch: opts.fetch ?? (globalThis.fetch as Fetcher),
    timeoutMs: opts.timeoutMs ?? 8000,
    rpcUrl: provider.url,
    registryUrl: opts.registryUrl ?? DEFAULT_REGISTRY,
    userAgent: `${TOOL_NAME}/${TOOL_VERSION}`,
  };
  const probe = createProber(ctx);
  const known = knownPackages(opts.rules);
  const disabled = new Set(opts.disabled ?? []);

  const pending: Promise<Finding | null>[] = [];
  const packages: DetectedPackage[] = [];

  for (const m of manifests) {
    const deps = new Map(m.packages.map((p) => [p.name, p]));
    for (const p of m.packages) if (known.has(p.name)) packages.push(p);

    for (const rule of opts.rules) {
      const dep = rule.package ? deps.get(rule.package) : undefined;
      if (rule.package && !dep) continue;
      if (dep && !versionMatches(dep.version, rule.versions)) continue;
      pending.push(evaluate(rule, m, dep));
    }
  }

  async function evaluate(rule: Rule, m: Manifest, dep?: DetectedPackage): Promise<Finding | null> {
    const locations = rule.code ? findMatches(rule.code, m.sources) : [];
    if (rule.code?.required && locations.length === 0) return null;

    const base: Omit<Finding, "status" | "probe" | "note"> = {
      ruleId: rule.id,
      package: rule.package,
      manifest: m.path,
      version: dep?.version,
      severity: rule.severity,
      title: rule.title,
      summary: rule.summary,
      fix: rule.fix,
      docs: rule.docs ?? [],
      locations,
    };

    // Every call site already applies the fix -> pass, no need to probe.
    if (rule.code?.mitigatedBy && locations.length > 0 && locations.every((l) => l.mitigated)) {
      return { ...base, status: "pass", note: "all call sites already apply the fix", probe: { source: "none" } };
    }

    let status: Status = rule.severity;
    let note: string | undefined;
    let outcome: ProbeOutcome = { source: "none" };

    if (rule.probe) {
      const cached = (): ProbeOutcome =>
        rule.verified
          ? { source: "cached", state: rule.verified.drift ? "drift" : "healthy", detail: `${rule.verified.detail} (verified ${rule.verified.date})`, target: describeTarget(rule.probe!, ctx) }
          : { source: "cached", state: "inconclusive", detail: "no cached verdict", target: describeTarget(rule.probe!, ctx) };

      if (opts.offline) {
        outcome = cached();
      } else {
        const live = await probe(rule.probe);
        if (live.state === "inconclusive") {
          outcome = { ...cached(), detail: `live probe inconclusive (${live.detail}); using cached: ${cached().detail}` };
        } else {
          outcome = { source: "live", ...live };
        }
      }
      if (outcome.state === "healthy") {
        status = "pass";
        note = outcome.source === "live" ? "upstream behaves as documented again - rule may be stale" : "cached verdict: no drift";
      }
    }

    if (status !== "pass" && rule.code && !rule.code.required && locations.length === 0) {
      note = "dependency present; no call sites found in scanned sources";
    }
    return { ...base, status, note, probe: outcome };
  }

  const findings = (await Promise.all(pending)).filter((f): f is Finding => f !== null);

  // Clean known SDKs get an explicit pass row so the report shows they were checked.
  for (const p of packages) {
    if (!findings.some((f) => f.package === p.name && f.manifest === p.manifest)) {
      findings.push({
        ruleId: "-",
        package: p.name,
        manifest: p.manifest,
        version: p.version,
        status: "pass",
        severity: "info",
        title: "No known drift",
        summary: `No rule matched ${p.name}@${p.version ?? p.range}.`,
        fix: "",
        docs: [],
        locations: [],
        probe: { source: "none" },
      });
    }
  }

  // Live on-chain address drift (skipped offline / when disabled entirely).
  let rpcInfo: Report["rpc"];
  if (!opts.offline) {
    rpcInfo = await probeRpcHeader(provider, {
      fetch: ctx.fetch,
      timeoutMs: ctx.timeoutMs,
      userAgent: ctx.userAgent,
    });

    if (!opts.skipOnChain) {
      const sources: SourceFile[] = manifests.flatMap((m) => m.sources);
      const hits = extractAddresses(sources);
      const onchain = await checkOnChainAddresses(hits, {
        fetch: ctx.fetch,
        timeoutMs: ctx.timeoutMs,
        userAgent: ctx.userAgent,
        provider,
      });
      rpcInfo.onChainQueried = onchain.queried;
      rpcInfo.onChainInconclusive = onchain.inconclusive;
      if (onchain.detail) rpcInfo.detail = (rpcInfo.detail ? rpcInfo.detail + "; " : "") + onchain.detail;
      findings.push(...filterOnChainFindings(onchain.findings, disabled));
    }
  }

  const order: Record<Status, number> = { fail: 0, warn: 1, info: 2, pass: 3 };
  findings.sort((a, b) => order[a.status] - order[b.status] || a.manifest.localeCompare(b.manifest) || a.ruleId.localeCompare(b.ruleId));

  const summary: Record<Status, number> = { pass: 0, info: 0, warn: 0, fail: 0 };
  for (const f of findings) summary[f.status]++;

  const onChainEnabled = !opts.offline && !opts.skipOnChain;
  const rulesLoaded = opts.rules.length + (onChainEnabled ? ONCHAIN_RULES.filter((r) => !disabled.has(r.id)).length : 0);

  return {
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    root: absRoot,
    mode: opts.offline ? "offline" : "live",
    generatedAt: (opts.now ? opts.now() : new Date()).toISOString(),
    rulesLoaded,
    manifests: manifests.map((m) => m.path),
    packages,
    findings,
    summary,
    rpc: rpcInfo,
  };
}

export type FailOn = "fail" | "warn" | "never";

export function exitCodeFor(report: Report, failOn: FailOn = "fail"): number {
  if (failOn === "never") return 0;
  if (report.summary.fail > 0) return 1;
  if (failOn === "warn" && report.summary.warn > 0) return 1;
  return 0;
}

export { resolveRpcProvider, type ResolveRpcOptions, type RpcProvider };
