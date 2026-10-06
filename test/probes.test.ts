import { test } from "node:test";
import assert from "node:assert/strict";
import { createProber, runProbe, type ProbeContext } from "../src/probes";
import { fakeFetch, json, text } from "./helpers";

const ctx = (fetch: ProbeContext["fetch"]): ProbeContext => ({
  fetch,
  timeoutMs: 500,
  rpcUrl: "https://rpc.test",
  registryUrl: "https://registry.test",
  userAgent: "test",
});

const hermes = { kind: "http" as const, url: "https://hermes.test/v2/updates/price/latest", driftWhen: { status: [401, 403] } };

test("http probe: 401 is drift, 200 is healthy, 429 is inconclusive", async () => {
  assert.equal((await runProbe(hermes, ctx(fakeFetch({ hermes: text(401, "unauthorized") }).fetch))).state, "drift");
  assert.equal((await runProbe(hermes, ctx(fakeFetch({ hermes: text(200, "{}") }).fetch))).state, "healthy");
  const r = await runProbe(hermes, ctx(fakeFetch({ hermes: text(429, "slow down") }).fetch));
  assert.equal(r.state, "inconclusive");
  assert.equal(r.httpStatus, 429);
});

test("http probe detail includes status and body snippet", async () => {
  const r = await runProbe(hermes, ctx(fakeFetch({ hermes: text(401, "unauthorized") }).fetch));
  assert.equal(r.detail, `HTTP 401 "unauthorized"`);
});

test("jsonrpc probe: -32601 is drift, result is healthy, {{rpcUrl}} is expanded", async () => {
  const probe = { kind: "jsonrpc" as const, url: "{{rpcUrl}}", method: "getRecentBlockhash", driftWhen: { rpcErrorCode: [-32601] } };
  const f = fakeFetch({ "rpc.test": json(200, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }) });
  const r = await runProbe(probe, ctx(f.fetch));
  assert.equal(r.state, "drift");
  assert.equal(f.calls[0], "https://rpc.test");
  assert.match(r.detail, /-32601 "Method not found"/);
  const ok = await runProbe(probe, ctx(fakeFetch({ "rpc.test": json(200, { result: { value: 1 } }) }).fetch));
  assert.equal(ok.state, "healthy");
  const limited = await runProbe(probe, ctx(fakeFetch({ "rpc.test": json(429, { error: { code: 429, message: "Too many requests" } }) }).fetch));
  assert.equal(limited.state, "inconclusive");
});

test("jsonrpc probe: provider-specific 'unsupported method' message is drift (Solami -32600)", async () => {
  const probe = {
    kind: "jsonrpc" as const,
    url: "{{rpcUrl}}",
    method: "getRecentBlockhash",
    driftWhen: { rpcErrorCode: [-32601], rpcErrorMessage: "unsupported method|method not found" },
  };
  const solami = fakeFetch({
    "rpc.test": json(200, { jsonrpc: "2.0", id: 1, error: { code: -32600, message: "Invalid Request: unsupported method `getRecentBlockhash`" } }),
  });
  const r = await runProbe(probe, ctx(solami.fetch));
  assert.equal(r.state, "drift");
  assert.match(r.detail, /-32600 "Invalid Request: unsupported method/);
  // A generic -32600 without the message stays inconclusive.
  const generic = await runProbe(probe, ctx(fakeFetch({ "rpc.test": json(200, { error: { code: -32600, message: "Invalid Request" } }) }).fetch));
  assert.equal(generic.state, "inconclusive");
  // Without rpcErrorMessage the old behaviour holds.
  const strict = { ...probe, driftWhen: { rpcErrorCode: [-32601] } };
  const s2 = await runProbe(strict, ctx(solami.fetch));
  assert.equal(s2.state, "inconclusive");
});

test("npm-deprecated probe reads the deprecation notice", async () => {
  const probe = { kind: "npm-deprecated" as const, package: "@scope/old" };
  const f = fakeFetch({ "registry.test": json(200, { version: "1.2.3", deprecated: "use @scope/new" }) });
  const r = await runProbe(probe, ctx(f.fetch));
  assert.equal(r.state, "drift");
  assert.equal(f.calls[0], "https://registry.test/@scope%2fold/latest");
  assert.equal((await runProbe(probe, ctx(fakeFetch({ "registry.test": json(200, { version: "2.0.0" }) }).fetch))).state, "healthy");
});

test("npm-published probe: 200 means the successor exists (drift), 404 healthy", async () => {
  const probe = { kind: "npm-published" as const, package: "@anchor-lang/core" };
  assert.equal((await runProbe(probe, ctx(fakeFetch({ "registry.test": json(200, { version: "1.2.0" }) }).fetch))).state, "drift");
  assert.equal((await runProbe(probe, ctx(fakeFetch({ "registry.test": text(404) }).fetch))).state, "healthy");
});

test("network errors and timeouts are inconclusive, never thrown", async () => {
  const boom = await runProbe(hermes, ctx(async () => { throw new Error("ECONNREFUSED"); }));
  assert.equal(boom.state, "inconclusive");
  assert.match(boom.detail, /ECONNREFUSED/);
  // AbortSignal.timeout() uses an unref'd timer, so hold the event loop open while we wait for it.
  const hang = (_u: string, init?: RequestInit) =>
    new Promise<Response>((_, rej) => {
      const keepAlive = setTimeout(() => rej(new Error("abort signal never fired")), 5000);
      init!.signal!.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        rej(init!.signal!.reason);
      });
    });
  const slow = await runProbe(hermes, ctx(hang));
  assert.equal(slow.state, "inconclusive");
  assert.match(slow.detail, /timeout after 500ms/);
});

test("createProber dedupes identical probes", async () => {
  const f = fakeFetch({ hermes: text(401) });
  const probe = createProber(ctx(f.fetch));
  await Promise.all([probe(hermes), probe(hermes), probe({ ...hermes })]);
  assert.equal(f.calls.length, 1);
});
