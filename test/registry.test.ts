import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builtinPack, loadPackFile, loadRules, mergePacks, RuleValidationError, validateRule } from "../src/rules/registry";

const base = { id: "X-1", severity: "warn", title: "t", summary: "s", fix: "f", package: "pkg" };

test("built-in pack is valid and ids are unique", () => {
  const pack = builtinPack();
  assert.ok(pack.rules.length >= 10);
  const ids = pack.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every built-in probe rule ships a cached verdict for --offline", () => {
  for (const r of builtinPack().rules.filter((r) => r.probe)) {
    assert.ok(r.verified, `${r.id} has a probe but no verified verdict`);
    assert.match(r.verified!.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("built-in pack covers the three launch SDKs", () => {
  const pkgs = new Set(builtinPack().rules.map((r) => r.package));
  for (const p of ["@pythnetwork/hermes-client", "@solana/web3.js", "@coral-xyz/anchor"]) assert.ok(pkgs.has(p), p);
});

test("validateRule rejects malformed rules with a precise message", () => {
  assert.throws(() => validateRule({ ...base, severity: "error" }), /severity must be one of/);
  assert.throws(() => validateRule({ ...base, versions: "not a range!!" }), /invalid semver range/);
  assert.throws(() => validateRule({ ...base, code: { pattern: "(" } }), /invalid regex/);
  assert.throws(() => validateRule({ ...base, package: undefined }), /code-only rules/);
  assert.throws(() => validateRule({ ...base, probe: { kind: "smtp" } }), /probe.kind/);
  assert.throws(() => validateRule({ ...base, title: undefined }), RuleValidationError);
  assert.doesNotThrow(() => validateRule({ ...base, package: undefined, code: { pattern: "foo", required: true } }));
});

test("later packs override earlier rules by id, and --disable removes them", () => {
  const a = { name: "a", rules: [validateRule(base), validateRule({ ...base, id: "X-2" })] };
  const b = { name: "b", rules: [validateRule({ ...base, severity: "fail" })] };
  const merged = mergePacks([a, b], ["X-2"]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].severity, "fail");
});

test("loadPackFile accepts a pack object or a bare array, and loadRules merges with built-ins", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdk-doctor-"));
  const f1 = join(dir, "pack.json");
  const f2 = join(dir, "array.json");
  writeFileSync(f1, JSON.stringify({ name: "custom", rules: [base] }));
  writeFileSync(f2, JSON.stringify([{ ...base, id: "X-9" }]));
  assert.equal(loadPackFile(f1).rules[0].id, "X-1");
  assert.equal(loadPackFile(f2).rules[0].id, "X-9");
  const all = loadRules({ extraRuleFiles: [f1, f2], disabled: ["PYTH-HERMES-KEYLESS-401"] });
  assert.ok(all.some((r) => r.id === "X-9"));
  assert.ok(!all.some((r) => r.id === "PYTH-HERMES-KEYLESS-401"));
  assert.deepEqual(loadRules({ noBuiltin: true, extraRuleFiles: [f1] }).map((r) => r.id), ["X-1"]);
  writeFileSync(f1, "{ nope");
  assert.throws(() => loadPackFile(f1), RuleValidationError);
});

test("validateRule checks code.argument and mitigationScope", () => {
  const base = { id: "X", package: "p", severity: "warn", title: "t", summary: "s", fix: "f" };
  assert.throws(() => validateRule({ ...base, code: { pattern: "foo\\((\\w+)\\)", argument: { group: "arg" } } }), /no named group "arg"/);
  assert.throws(() => validateRule({ ...base, code: { pattern: "x", mitigationScope: "line" } }), /mitigationScope/);
  assert.doesNotThrow(() => validateRule({ ...base, code: { pattern: "foo\\((?<arg>\\w+)\\)", argument: { group: "arg", names: "sig$" } } }));
});
