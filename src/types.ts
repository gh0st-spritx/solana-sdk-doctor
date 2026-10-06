/** Severity a rule carries when its drift is confirmed. */
export type Severity = "info" | "warn" | "fail";
/** Final status of a finding row. */
export type Status = "pass" | Severity;

export const STATUS_ORDER: Record<Status, number> = { pass: 0, info: 1, warn: 2, fail: 3 };

/** Source-code check attached to a rule. */
export interface CodeCheck {
  /** JS regex (no slashes) matched against source files. */
  pattern: string;
  /** Regex flags, default "g". "g" is always added. */
  flags?: string;
  /** If true the rule only fires when the pattern matches somewhere. */
  required?: boolean;
  /** Regex that, when present, means a call site already applies the fix. */
  mitigatedBy?: string;
  /**
   * Where to look for `mitigatedBy`. Default "call": the call expression the match belongs to (its arguments,
   * plus any options object / variable those arguments reference in the same file). "file": anywhere in the file.
   */
  mitigationScope?: "call" | "file";
  /**
   * Also match inside JS/TS comments and Markdown prose. Default false: comments are skipped and Markdown
   * files only match inside fenced code blocks.
   */
  includeComments?: boolean;
  /** Keep a match only if a captured argument looks like the targeted kind (e.g. a signature string). */
  argument?: ArgumentCheck;
}

/**
 * Static "is this argument a X?" heuristic for call-site rules. The match is kept when the named capture
 * `group` is a string literal (unless `literals` is false), or an identifier/member whose last segment
 * matches `names` (case-insensitive), whose in-file initializer matches `assignedFrom`, or whose declared
 * type / parameter annotation matches `types`. Identifiers initialised with an object/array literal are
 * always rejected; anything unresolvable is rejected (no guess = no false positive).
 */
export interface ArgumentCheck {
  group: string;
  literals?: boolean;
  names?: string;
  assignedFrom?: string;
  types?: string;
}

export interface HttpProbe {
  kind: "http";
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  /** HTTP statuses that prove the documented behaviour no longer holds. */
  driftWhen: { status?: number[]; bodyIncludes?: string };
  /** HTTP statuses that prove the documented behaviour still holds. Default: 200-299. */
  healthyWhen?: { status?: number[] };
}

export interface JsonRpcProbe {
  kind: "jsonrpc";
  /** RPC URL. `{{rpcUrl}}` is replaced by --rpc-url (default Solana mainnet-beta). */
  url: string;
  method: string;
  params?: unknown[];
  /**
   * JSON-RPC error codes that prove drift, e.g. -32601 (method not found).
   * `rpcErrorMessage` (case-insensitive regex) also counts as drift when the provider uses a
   * different code for the same condition, e.g. Solami answers removed methods with
   * -32600 "Invalid Request: unsupported method `getRecentBlockhash`".
   */
  driftWhen: { rpcErrorCode: number[]; rpcErrorMessage?: string };
}

export interface NpmDeprecatedProbe {
  kind: "npm-deprecated";
  package: string;
  /** Version or dist-tag to inspect, default "latest". */
  version?: string;
}

export interface NpmPublishedProbe {
  /** Drift is confirmed when `package` (e.g. a successor/renamed package) is published. */
  kind: "npm-published";
  package: string;
}

export type Probe = HttpProbe | JsonRpcProbe | NpmDeprecatedProbe | NpmPublishedProbe;

/** The last time a maintainer verified this rule by hand / in CI. Used by --offline. */
export interface CachedVerdict {
  date: string;
  drift: boolean;
  detail: string;
}

export interface Rule {
  id: string;
  /** npm package the rule is about. Omit for code-only rules (e.g. raw endpoint URLs). */
  package?: string;
  /** semver range of affected versions, default "*". */
  versions?: string;
  severity: Severity;
  title: string;
  summary: string;
  fix: string;
  docs?: string[];
  code?: CodeCheck;
  probe?: Probe;
  verified?: CachedVerdict;
  tags?: string[];
}

export interface RulePack {
  name: string;
  version?: string;
  rules: Rule[];
}

export interface CodeLocation {
  file: string;
  line: number;
  snippet: string;
  mitigated: boolean;
}

export type ProbeState = "drift" | "healthy" | "inconclusive";

export interface ProbeResult {
  state: ProbeState;
  detail: string;
  target: string;
  httpStatus?: number;
  ms?: number;
}

export interface ProbeOutcome extends Partial<ProbeResult> {
  source: "live" | "cached" | "none";
}

export interface DetectedPackage {
  manifest: string;
  name: string;
  range: string;
  version?: string;
  versionSource: "node_modules" | "lockfile" | "range" | "unknown";
  dev: boolean;
}

export interface Finding {
  ruleId: string;
  package?: string;
  manifest: string;
  version?: string;
  status: Status;
  severity: Severity;
  title: string;
  summary: string;
  fix: string;
  docs: string[];
  note?: string;
  locations: CodeLocation[];
  probe: ProbeOutcome;
}

/** Optional live-RPC header (provider, slot, latency). Secrets are always redacted. */
export interface RpcInfo {
  provider: string;
  url: string;
  slot?: number;
  latencyMs?: number;
  detail?: string;
  /** Addresses queried by on-chain drift rules (unique pubkeys). */
  onChainQueried?: number;
  onChainInconclusive?: boolean;
}

export interface Report {
  tool: { name: string; version: string };
  root: string;
  mode: "live" | "offline";
  generatedAt: string;
  rulesLoaded: number;
  manifests: string[];
  packages: DetectedPackage[];
  findings: Finding[];
  summary: Record<Status, number>;
  /** Present in live mode when an RPC endpoint was contacted. */
  rpc?: RpcInfo;
}
