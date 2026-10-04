import { readFileSync } from "node:fs";
import semver from "semver";
import builtin from "./builtin.json";
import type { Rule, RulePack, Severity } from "../types";

const SEVERITIES: Severity[] = ["info", "warn", "fail"];
const PROBE_KINDS = ["http", "jsonrpc", "npm-deprecated", "npm-published"];

export class RuleValidationError extends Error {}

/** Validate a single rule; throws RuleValidationError with a precise message. */
export function validateRule(rule: unknown, where = "rule"): Rule {
  const r = rule as Partial<Rule>;
  const fail = (msg: string): never => {
    throw new RuleValidationError(`${where}${r && r.id ? ` (${r.id})` : ""}: ${msg}`);
  };
  if (!r || typeof r !== "object") fail("must be an object");
  if (!r.id || typeof r.id !== "string") fail("missing string `id`");
  if (!r.severity || !SEVERITIES.includes(r.severity)) fail(`severity must be one of ${SEVERITIES.join(", ")}`);
  for (const k of ["title", "summary", "fix"] as const) {
    if (!r[k] || typeof r[k] !== "string") fail(`missing string \`${k}\``);
  }
  if (r.versions !== undefined && semver.validRange(r.versions) === null) fail(`invalid semver range "${r.versions}"`);
  if (!r.package && !(r.code && r.code.required)) fail("code-only rules (no `package`) must set code.required = true");
  if (r.code) {
    if (r.code.mitigationScope !== undefined && !["call", "file"].includes(r.code.mitigationScope)) fail('code.mitigationScope must be "call" or "file"');
    try {
      new RegExp(r.code.pattern, r.code.flags);
      if (r.code.mitigatedBy) new RegExp(r.code.mitigatedBy);
      const a = r.code.argument;
      if (a) {
        if (a.names) new RegExp(a.names, "i");
        if (a.assignedFrom) new RegExp(a.assignedFrom);
        if (a.types) new RegExp(a.types);
      }
    } catch (e) {
      fail(`invalid regex: ${(e as Error).message}`);
    }
    const a = r.code.argument;
    if (a && (!a.group || typeof a.group !== "string")) fail("code.argument.group must name a capture group");
    if (a && !r.code.pattern.includes(`(?<${a.group}>`)) fail(`code.pattern has no named group "${a.group}"`);
  }
  if (r.probe) {
    if (!PROBE_KINDS.includes(r.probe.kind)) fail(`probe.kind must be one of ${PROBE_KINDS.join(", ")}`);
    if ((r.probe.kind === "http" || r.probe.kind === "jsonrpc") && !r.probe.url) fail("probe.url is required");
  }
  return r as Rule;
}

export function validatePack(pack: unknown, where = "rule pack"): RulePack {
  const p = pack as Partial<RulePack>;
  if (!p || typeof p !== "object" || !Array.isArray(p.rules)) {
    throw new RuleValidationError(`${where}: expected { "name": string, "rules": Rule[] }`);
  }
  const rules = p.rules.map((r, i) => validateRule(r, `${where} rules[${i}]`));
  return { name: p.name ?? where, version: p.version, rules };
}

export function builtinPack(): RulePack {
  return validatePack(builtin, "builtin");
}

export function loadPackFile(file: string): RulePack {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new RuleValidationError(`${file}: ${(e as Error).message}`);
  }
  // Allow a bare array of rules as a shorthand.
  if (Array.isArray(raw)) raw = { name: file, rules: raw };
  return validatePack(raw, file);
}

/**
 * Merge packs in order. Later packs override earlier rules with the same id,
 * so a project can tune or disable (severity override) a built-in rule.
 */
export function mergePacks(packs: RulePack[], disabled: string[] = []): Rule[] {
  const byId = new Map<string, Rule>();
  for (const pack of packs) for (const rule of pack.rules) byId.set(rule.id, rule);
  for (const id of disabled) byId.delete(id);
  return [...byId.values()];
}

export function loadRules(opts: { extraRuleFiles?: string[]; disabled?: string[]; noBuiltin?: boolean } = {}): Rule[] {
  const packs: RulePack[] = [];
  if (!opts.noBuiltin) packs.push(builtinPack());
  for (const f of opts.extraRuleFiles ?? []) packs.push(loadPackFile(f));
  return mergePacks(packs, opts.disabled);
}
