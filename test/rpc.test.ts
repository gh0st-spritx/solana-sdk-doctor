import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, resolveRpcProvider, solamiRpcUrl, RpcConfigError, SOLAMI_RPC_BASE } from "../src/rpc";

test("solamiRpcUrl builds ?api_key= endpoint and refuses empty keys", () => {
  assert.equal(solamiRpcUrl("sk_test_abc"), `${SOLAMI_RPC_BASE}?api_key=sk_test_abc`);
  assert.equal(solamiRpcUrl("k", "fra"), "https://fra.rpc.solami.dev/sol?api_key=k");
  assert.throws(() => solamiRpcUrl("  "), RpcConfigError);
});

test("resolveRpcProvider: --rpc solami requires SOLAMI_API_KEY", () => {
  assert.throws(() => resolveRpcProvider({ rpc: "solami", env: {} }), /SOLAMI_API_KEY/);
  const p = resolveRpcProvider({ rpc: "solami", env: { SOLAMI_API_KEY: "sk_live_xyz" } });
  assert.equal(p.kind, "solami");
  assert.match(p.url, /api_key=sk_live_xyz/);
  assert.equal(p.displayUrl.includes("sk_live_xyz"), false);
  assert.match(p.displayUrl, /api_key=\*\*\*/);
});

test("resolveRpcProvider: explicit URL wins; env SOLAMI_API_KEY auto-selects solami", () => {
  const custom = resolveRpcProvider({ rpc: "https://my.rpc.example/sol", env: { SOLAMI_API_KEY: "sk_x" } });
  assert.equal(custom.kind, "custom");
  assert.equal(custom.url, "https://my.rpc.example/sol");

  const auto = resolveRpcProvider({ env: { SOLAMI_API_KEY: "sk_auto" } });
  assert.equal(auto.kind, "solami");
  assert.match(auto.url, /sk_auto/);

  const fallback = resolveRpcProvider({ env: { SOLANA_RPC_URL: "https://h.example" } });
  assert.equal(fallback.url, "https://h.example");

  const pub = resolveRpcProvider({ env: {} });
  assert.equal(pub.kind, "public");
  assert.match(pub.url, /mainnet-beta/);
});

test("redactSecrets strips api keys, bearer tokens, and sk_ prefixes", () => {
  assert.equal(redactSecrets("https://rpc.solami.dev/sol?api_key=sk_live_secret&x=1"), "https://rpc.solami.dev/sol?api_key=***&x=1");
  assert.equal(redactSecrets("Authorization: Bearer abc.def"), "Authorization: Bearer ***");
  assert.match(redactSecrets("got sk_abcdefghijklmnop"), /sk_\*\*\*/);
});
