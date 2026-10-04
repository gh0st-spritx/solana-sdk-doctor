#!/usr/bin/env node
import { existsSync, statSync, writeFileSync } from "node:fs";
import { diagnose, exitCodeFor, type FailOn } from "./engine";
import { render, type Format } from "./report";
import { colorSupported } from "./report/color";
import { loadRules, RuleValidationError } from "./rules/registry";
import { DEFAULT_RPC_URL } from "./probes";
import { TOOL_NAME, TOOL_VERSION } from "./version";

const HELP = `${TOOL_NAME} v${TOOL_VERSION}
Scan a repo's Solana / oracle SDK dependencies for docs-vs-reality drift.

Usage
  solana-sdk-doctor [path] [options]
  solana-sdk-doctor rules [--rules file.json]     list loaded rules

Options
  --offline              Don't hit the network; use each rule's cached verdict
  --format <f>           table (default) | json | markdown
  --json                 Shorthand for --format json
  --output, -o <file>    Also write the report to <file> (repeatable). Format from the
                         extension: .json -> json, .md -> markdown, anything else -> plain table
  --rules <file>         Load an extra rule pack (repeatable). Same id overrides built-in
  --disable <ids>        Comma-separated rule ids to skip
  --no-builtin           Only use rules passed via --rules
  --fail-on <level>      fail (default) | warn | never  - controls exit code
  --rpc-url <url>        Solana RPC used by JSON-RPC probes (default ${DEFAULT_RPC_URL})
  --timeout <ms>         Per-probe timeout (default 8000)
  --verbose, -v          Show details for passing rows too
  --no-color             Disable ANSI colors (also honours NO_COLOR)
  --version, -V          Print version
  --help, -h             Show this help

Exit codes
  0  no findings at or above --fail-on
  1  drift found at or above --fail-on
  2  usage / configuration error
`;

interface Args {
  path: string;
  command: "scan" | "rules";
  offline: boolean;
  format: Format;
  outputs: string[];
  rules: string[];
  disabled: string[];
  noBuiltin: boolean;
  failOn: FailOn;
  rpcUrl?: string;
  timeoutMs: number;
  verbose: boolean;
  color: boolean;
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): Args | "help" | "version" {
  const a: Args = {
    path: ".",
    command: "scan",
    offline: false,
    format: "table",
    outputs: [],
    rules: [],
    disabled: [],
    noBuiltin: false,
    failOn: "fail",
    timeoutMs: 8000,
    verbose: false,
    color: colorSupported(),
  };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const [flag, inline] = raw.startsWith("--") && raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || (inline === undefined && v.startsWith("-"))) throw new UsageError(`${flag} requires a value`);
      return v;
    };
    switch (flag) {
      case "-h": case "--help": return "help";
      case "-V": case "--version": return "version";
      case "--offline": a.offline = true; break;
      case "--json": a.format = "json"; break;
      case "--format": {
        const f = value();
        if (!["table", "json", "markdown", "md"].includes(f)) throw new UsageError(`unknown format "${f}"`);
        a.format = (f === "md" ? "markdown" : f) as Format;
        break;
      }
      case "-o": case "--output": a.outputs.push(value()); break;
      case "--rules": a.rules.push(value()); break;
      case "--disable": a.disabled.push(...value().split(",").map((s) => s.trim()).filter(Boolean)); break;
      case "--no-builtin": a.noBuiltin = true; break;
      case "--fail-on": {
        const f = value();
        if (!["fail", "warn", "never"].includes(f)) throw new UsageError(`--fail-on must be fail|warn|never`);
        a.failOn = f as FailOn;
        break;
      }
      case "--rpc-url": a.rpcUrl = value(); break;
      case "--timeout": {
        const n = Number(value());
        if (!Number.isFinite(n) || n <= 0) throw new UsageError("--timeout must be a positive number");
        a.timeoutMs = n;
        break;
      }
      case "-v": case "--verbose": a.verbose = true; break;
      case "--no-color": a.color = false; break;
      case "--color": a.color = true; break;
      default:
        if (flag.startsWith("-")) throw new UsageError(`unknown option ${flag}`);
        positionals.push(raw);
    }
  }
  if (positionals[0] === "rules") {
    a.command = "rules";
    positionals.shift();
  }
  if (positionals.length > 1) throw new UsageError(`expected at most one path, got: ${positionals.join(" ")}`);
  if (positionals[0]) a.path = positionals[0];
  return a;
}

export async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`error: ${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  if (args === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (args === "version") {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }

  let rules;
  try {
    rules = loadRules({ extraRuleFiles: args.rules, disabled: args.disabled, noBuiltin: args.noBuiltin });
  } catch (e) {
    process.stderr.write(`error: ${e instanceof RuleValidationError ? "invalid rule pack: " : ""}${(e as Error).message}\n`);
    return 2;
  }

  if (args.command === "rules") {
    if (args.format === "json") process.stdout.write(JSON.stringify(rules, null, 2) + "\n");
    else for (const r of rules) process.stdout.write(`${r.severity.toUpperCase().padEnd(4)}  ${r.id.padEnd(38)} ${(r.package ?? "(source code)").padEnd(36)} ${r.probe ? `[probe:${r.probe.kind}]` : ""}\n`);
    return 0;
  }

  if (!existsSync(args.path) || !statSync(args.path).isDirectory()) {
    process.stderr.write(`error: ${args.path} is not a directory\n`);
    return 2;
  }

  const report = await diagnose(args.path, { rules, offline: args.offline, rpcUrl: args.rpcUrl, timeoutMs: args.timeoutMs });
  const text = render(report, args.format, { color: args.color && args.format === "table", verbose: args.verbose });
  process.stdout.write(text);
  for (const file of args.outputs) {
    const fmt: Format = /\.json$/i.test(file) ? "json" : /\.(md|markdown)$/i.test(file) ? "markdown" : "table";
    writeFileSync(file, render(report, fmt, { verbose: args.verbose, color: false }));
  }
  return exitCodeFor(report, args.failOn);
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
      process.exit(2);
    },
  );
}
