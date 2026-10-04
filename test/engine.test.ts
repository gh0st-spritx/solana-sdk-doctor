import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, exitCodeFor, versionMatches } from "../src/engine";
import { builtinPack, validateRule } from "../src/rules/registry";
import type { Rule } from "../src/types";
import { fakeFetch, json, manifest, text } from "./helpers";

const rules = builtinPack().rules;
const QUICKSTART = `const connection = new HermesClient("https://hermes.pyth.network", {});`;
const FIXED = `const connection = new HermesClient("https://hermes.pyth.network", { accessToken: process.env.T });`;

const liveFetch = () =>
  fakeFetch({
    "hermes.pyth.network": text(401, "unauthorized"),
    "api.mainnet-beta.solana.com": json(200, { error: { code: -32601, message: "Method not found" } }),
    "registry.npmjs.org": json(200, { version: "9.9.9", deprecated: "gone" }),
  });

const byId = (r: Awaited<ReturnType<typeof diagnose>>, id: string) => r.findings.filter((f) => f.ruleId === id);

test("versionMatches handles ranges and unknown versions conservatively", () => {
  assert.ok(versionMatches("2.1.0", "<3.1.0"));
  assert.ok(!versionMatches("3.1.0", "<3.1.0"));
  assert.ok(versionMatches(undefined, "<3.1.0"));
  assert.ok(versionMatches("1.0.0", "*"));
});

test("the real Pyth bug: keyless Quickstart + live 401 => FAIL with evidence", async () => {
  const f = liveFetch();
  const report = await diagnose("/virtual", {
    rules,
    fetch: f.fetch,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "src/p.ts": QUICKSTART })],
  });
  const [finding] = byId(report, "PYTH-HERMES-KEYLESS-401");
  assert.equal(finding.status, "fail");
  assert.equal(finding.probe.source, "live");
  assert.equal(finding.probe.httpStatus, 401);
  assert.equal(finding.locations[0].file, "src/p.ts");
  assert.equal(exitCodeFor(report), 1);
});

test("call sites that pass accessToken are PASS and skip the network", async () => {
  const f = liveFetch();
  const report = await diagnose("/virtual", {
    rules,
    fetch: f.fetch,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "src/p.ts": FIXED })],
  });
  assert.equal(byId(report, "PYTH-HERMES-KEYLESS-401")[0].status, "pass");
  assert.ok(!f.calls.some((u) => u.includes("hermes")));
  assert.equal(exitCodeFor(report), 0);
});

test("old hermes-client also gets the <3.1.0 upgrade warning", async () => {
  const report = await diagnose("/virtual", {
    rules,
    offline: true,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "2.1.0" })],
  });
  assert.equal(byId(report, "PYTH-HERMES-NO-ACCESSTOKEN-OPTION")[0].status, "warn");
  const k = byId(report, "PYTH-HERMES-KEYLESS-401")[0];
  assert.equal(k.status, "fail");
  assert.match(k.note ?? "", /no call sites found/);
});

test("--offline never touches the network and uses cached verdicts", async () => {
  const f = fakeFetch({});
  const report = await diagnose("/virtual", {
    rules,
    offline: true,
    fetch: f.fetch,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0", "@solana/web3.js": "1.95.0" }, { "a.ts": QUICKSTART + "\nawait c.getRecentBlockhash();" })],
  });
  assert.equal(f.calls.length, 0);
  assert.equal(report.mode, "offline");
  const k = byId(report, "PYTH-HERMES-KEYLESS-401")[0];
  assert.equal(k.probe.source, "cached");
  assert.match(k.probe.detail!, /verified 2026-10-04/);
  assert.equal(byId(report, "SOLANA-REMOVED-RPC-METHODS")[0].status, "fail");
});

test("upstream healthy again => PASS with a stale-rule note", async () => {
  const f = fakeFetch({ "hermes.pyth.network": text(200, "{}"), "registry.npmjs.org": text(404) });
  const report = await diagnose("/virtual", {
    rules,
    fetch: f.fetch,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "p.ts": QUICKSTART })],
  });
  const k = byId(report, "PYTH-HERMES-KEYLESS-401")[0];
  assert.equal(k.status, "pass");
  assert.match(k.note!, /rule may be stale/);
});

test("inconclusive live probe (429) falls back to the cached verdict", async () => {
  const f = fakeFetch({ "hermes.pyth.network": text(429, "rate limited") });
  const report = await diagnose("/virtual", {
    rules,
    fetch: f.fetch,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "p.ts": QUICKSTART })],
  });
  const k = byId(report, "PYTH-HERMES-KEYLESS-401")[0];
  assert.equal(k.status, "fail");
  assert.equal(k.probe.source, "cached");
  assert.match(k.probe.detail!, /inconclusive \(HTTP 429/);
});

test("code.required rules only fire when the pattern is present", async () => {
  const clean = await diagnose("/virtual", {
    rules,
    offline: true,
    manifests: [manifest("package.json", { "@solana/web3.js": "1.95.0" }, { "a.ts": "await c.getLatestBlockhash();" })],
  });
  assert.equal(byId(clean, "SOLANA-REMOVED-RPC-METHODS").length, 0);
  assert.equal(byId(clean, "SOLANA-WEB3JS-V1-MAINTENANCE")[0].status, "info");
  assert.equal(exitCodeFor(clean), 0);
  assert.equal(exitCodeFor(clean, "warn"), 0);
});

test("version ranges gate rules (Anchor ctor rule only for >=0.30)", async () => {
  const src = { "p.ts": "new anchor.Program(idl, programId, provider)" };
  const old = await diagnose("/v", { rules, offline: true, manifests: [manifest("package.json", { "@coral-xyz/anchor": "0.29.0" }, src)] });
  const neu = await diagnose("/v", { rules, offline: true, manifests: [manifest("package.json", { "@coral-xyz/anchor": "0.30.1" }, src)] });
  assert.equal(byId(old, "ANCHOR-PROGRAM-CTOR-0.30").length, 0);
  assert.equal(byId(neu, "ANCHOR-PROGRAM-CTOR-0.30")[0].status, "fail");
});

test("code-only rules apply without a dependency", async () => {
  const report = await diagnose("/v", {
    rules,
    offline: true,
    manifests: [manifest("package.json", {}, { "bot.py.md": "curl https://hermes.pyth.network/v2/updates/price/latest?ids[]=x" })],
  });
  assert.equal(byId(report, "PYTH-HERMES-RAW-ENDPOINT")[0].status, "fail");
});

test("monorepo: each endpoint is probed once; clean known SDKs get a PASS row", async () => {
  const f = liveFetch();
  const report = await diagnose("/virtual", {
    rules,
    fetch: f.fetch,
    manifests: [
      manifest("a/package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "a/x.ts": QUICKSTART }),
      manifest("b/package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "b/x.ts": QUICKSTART }),
      manifest("c/package.json", { "@solana/web3.js": "2.0.0" }),
    ],
  });
  assert.equal(f.calls.filter((u) => u.includes("hermes")).length, 1);
  assert.equal(byId(report, "PYTH-HERMES-KEYLESS-401").length, 2);
  assert.equal(byId(report, "SOLANA-WEB3JS-V2-RENAMED")[0].status, "warn");
  assert.deepEqual(report.summary, { pass: 0, info: 0, warn: 1, fail: 2 });
});

test("custom rule packs plug in without code changes", async () => {
  const custom: Rule = validateRule({
    id: "ACME-OLD-SDK",
    package: "@acme/sdk",
    versions: "<2",
    severity: "warn",
    title: "Acme v1 sunset",
    summary: "v1 endpoints sunset",
    fix: "upgrade",
    probe: { kind: "http", url: "https://acme.test/v1/health", driftWhen: { status: [410] } },
  });
  const f = fakeFetch({ "acme.test": text(410, "gone") });
  const report = await diagnose("/v", { rules: [custom], fetch: f.fetch, manifests: [manifest("package.json", { "@acme/sdk": "1.4.0" })] });
  assert.equal(report.findings[0].status, "warn");
  assert.equal(exitCodeFor(report, "fail"), 0);
  assert.equal(exitCodeFor(report, "warn"), 1);
  assert.equal(exitCodeFor(report, "never"), 0);
});

test("scoped mitigation: unrelated accessToken in the same file no longer yields a PASS", async () => {
  const src = `const accessToken = process.env.T;\nexport const token = accessToken;\n${QUICKSTART}`;
  const report = await diagnose("/v", {
    rules,
    offline: true,
    manifests: [manifest("package.json", { "@pythnetwork/hermes-client": "3.1.0" }, { "src/prices.ts": src })],
  });
  const f = byId(report, "PYTH-HERMES-KEYLESS-401")[0];
  assert.equal(f.status, "fail");
  assert.deepEqual(f.locations.map((l) => l.mitigated), [false]);
});

test("commented-out drifted calls produce no finding", async () => {
  const src = `// const { blockhash } = await connection.getRecentBlockhash();\n/* await connection.confirmTransaction(sig); */\nconst s = { signature, blockhash, lastValidBlockHeight };\nawait connection.confirmTransaction(s, "confirmed");`;
  const report = await diagnose("/v", {
    rules,
    offline: true,
    manifests: [manifest("package.json", { "@solana/web3.js": "1.98.0" }, { "src/send.ts": src })],
  });
  assert.equal(byId(report, "SOLANA-REMOVED-RPC-METHODS").length, 0);
  assert.equal(byId(report, "SOLANA-CONFIRM-TX-STRING").length, 0);
});
