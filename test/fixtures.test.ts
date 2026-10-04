import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { diagnose, exitCodeFor } from "../src/engine";
import { builtinPack } from "../src/rules/registry";
import { scan } from "../src/scanner";
import { COMMENT_MARKER, renderMarkdown } from "../src/report/markdown";

const root = join(__dirname, "..");
const demo = join(root, "fixtures/demo-dapp");
const healthy = join(root, "fixtures/healthy-dapp");
const rules = builtinPack().rules;

test("scanner finds both workspace manifests and resolves versions from ranges", () => {
  const ms = scan(demo);
  assert.deepEqual(ms.map((m) => m.path), ["package.json", "packages/legacy-bot/package.json"]);
  const hermes = ms[1].packages.find((p) => p.name === "@pythnetwork/hermes-client")!;
  assert.equal(hermes.version, "2.1.0");
  assert.equal(hermes.versionSource, "range");
  assert.ok(ms[0].sources.some((s) => s.path === "src/prices.ts"));
  assert.ok(ms[0].sources.some((s) => s.path === "README.md"), "docs are scanned too");
  assert.ok(!ms[0].sources.some((s) => s.path.startsWith("packages/")), "files belong to nearest manifest");
});

test("demo-dapp (offline) reports the expected drift", async () => {
  const report = await diagnose(demo, { rules, offline: true });
  const failing = new Set(report.findings.filter((f) => f.status === "fail").map((f) => f.ruleId));
  for (const id of ["PYTH-HERMES-KEYLESS-401", "PYTH-HERMES-RAW-ENDPOINT", "SOLANA-REMOVED-RPC-METHODS", "ANCHOR-PROGRAM-CTOR-0.30"]) {
    assert.ok(failing.has(id), `expected ${id} to fail`);
  }
  const warned = new Set(report.findings.filter((f) => f.status === "warn").map((f) => f.ruleId));
  for (const id of ["PYTH-PRICE-SERVICE-CLIENT-DEPRECATED", "ANCHOR-PROJECT-SERUM-PACKAGE", "SOLANA-CONFIRM-TX-STRING", "SOLANA-PUBLIC-RPC-HARDCODED", "PYTH-HERMES-NO-ACCESSTOKEN-OPTION"]) {
    assert.ok(warned.has(id), `expected ${id} to warn`);
  }
  assert.equal(exitCodeFor(report), 1);
  const md = renderMarkdown(report);
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.match(md, /SDK drift detected/);
});

test("healthy-dapp (offline) passes CI", async () => {
  const report = await diagnose(healthy, { rules, offline: true });
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.warn, 0);
  assert.equal(report.findings.find((f) => f.ruleId === "PYTH-HERMES-KEYLESS-401")!.status, "pass");
  assert.equal(exitCodeFor(report, "warn"), 0);
});

const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", join(root, "src/cli.ts"), ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });

test("CLI: exit 1 on drift, 0 when healthy, 2 on bad usage", () => {
  const bad = cli(demo, "--offline");
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /FAIL\s+PYTH-HERMES-KEYLESS-401/);
  assert.match(bad.stdout, /Summary: \d+ fail/);
  assert.equal(cli(healthy, "--offline").status, 0);
  assert.equal(cli(demo, "--offline", "--fail-on", "never").status, 0);
  assert.equal(cli("--bogus").status, 2);
  assert.equal(cli("/definitely/not/here").status, 2);
});

test("CLI: --json emits a parseable report", () => {
  const r = cli(demo, "--offline", "--json");
  const report = JSON.parse(r.stdout);
  assert.equal(report.mode, "offline");
  assert.ok(report.summary.fail >= 4);
});
