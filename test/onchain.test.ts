import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOnChainAddresses, fetchAccounts, ONCHAIN_RULES, TOKEN_PROGRAM, PYTH_ORACLE_DEVNET } from "../src/onchain";
import type { ExtractedAddress } from "../src/addresses";
import { resolveRpcProvider } from "../src/rpc";
import { fakeFetch, json } from "./helpers";

const provider = resolveRpcProvider({ rpc: "https://rpc.test", env: {} });

const hit = (pubkey: string, kind: ExtractedAddress["kind"] = "program"): ExtractedAddress => ({
  pubkey,
  file: "src/p.ts",
  line: 1,
  snippet: `new PublicKey("${pubkey}")`,
  kind,
  name: kind === "program" ? "PROGRAM_ID" : undefined,
});

const ctx = (fetch: any) => ({
  fetch,
  timeoutMs: 500,
  userAgent: "test",
  provider,
  isMainnet: true,
});

test("ONCHAIN_RULES exposes four rule ids", () => {
  assert.deepEqual(
    ONCHAIN_RULES.map((r) => r.id).sort(),
    ["ONCHAIN-ACCOUNT-MISSING", "ONCHAIN-DEVNET-ON-MAINNET", "ONCHAIN-OWNER-MISMATCH", "ONCHAIN-PROGRAM-NOT-EXECUTABLE"].sort(),
  );
});

test("missing account → ONCHAIN-ACCOUNT-MISSING fail", async () => {
  const dead = "61xbcX6texMRKS4qzDhbGEnjenYLJTHD8wXypY2BnaHz";
  const f = fakeFetch({
    "rpc.test": json(200, { jsonrpc: "2.0", id: 1, result: { value: [null] } }),
  });
  const { findings } = await checkOnChainAddresses([hit(dead, "account")], ctx(f.fetch));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "ONCHAIN-ACCOUNT-MISSING");
  assert.equal(findings[0].status, "fail");
  assert.equal(findings[0].locations[0].file, "src/p.ts");
});

test("non-executable program id → ONCHAIN-PROGRAM-NOT-EXECUTABLE fail", async () => {
  const pk = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS";
  const f = fakeFetch({
    "rpc.test": json(200, {
      jsonrpc: "2.0",
      id: 1,
      result: {
        value: [{ executable: false, owner: "11111111111111111111111111111111", lamports: 1, data: ["", "base64"] }],
      },
    }),
  });
  const { findings } = await checkOnChainAddresses([hit(pk, "program")], ctx(f.fetch));
  assert.ok(findings.some((x) => x.ruleId === "ONCHAIN-PROGRAM-NOT-EXECUTABLE"));
});

test("devnet-only address on mainnet → WARN (and missing → FAIL)", async () => {
  const f = fakeFetch({
    "rpc.test": json(200, { jsonrpc: "2.0", id: 1, result: { value: [null] } }),
  });
  const { findings } = await checkOnChainAddresses([hit(PYTH_ORACLE_DEVNET, "program")], ctx(f.fetch));
  const ids = new Set(findings.map((x) => x.ruleId));
  assert.ok(ids.has("ONCHAIN-DEVNET-ON-MAINNET"));
  assert.ok(ids.has("ONCHAIN-ACCOUNT-MISSING"));
});

test("owner mismatch vs known table → WARN", async () => {
  const f = fakeFetch({
    "rpc.test": json(200, {
      jsonrpc: "2.0",
      id: 1,
      result: {
        value: [{ executable: true, owner: "11111111111111111111111111111111", lamports: 1, data: ["", "base64"] }],
      },
    }),
  });
  const { findings } = await checkOnChainAddresses([hit(TOKEN_PROGRAM, "program")], ctx(f.fetch));
  assert.ok(findings.some((x) => x.ruleId === "ONCHAIN-OWNER-MISMATCH"));
});

test("rate limit / timeout → inconclusive, no fail findings", async () => {
  const f = fakeFetch({ "rpc.test": json(429, { error: { code: -32005, message: "Too many requests" } }) });
  const r = await checkOnChainAddresses([hit(TOKEN_PROGRAM)], ctx(f.fetch));
  assert.equal(r.inconclusive, true);
  assert.equal(r.findings.length, 0);

  const hang = (_u: string, init?: RequestInit) =>
    new Promise<Response>((_, rej) => {
      const keepAlive = setTimeout(() => rej(new Error("abort signal never fired")), 5000);
      init!.signal!.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        rej(init!.signal!.reason);
      });
    });
  const slow = await fetchAccounts([TOKEN_PROGRAM], ctx(hang));
  assert.equal(slow.get(TOKEN_PROGRAM)!.lookup, "inconclusive");
  assert.match(slow.get(TOKEN_PROGRAM)!.detail, /timeout/);
});

test("healthy known program produces no findings", async () => {
  const f = fakeFetch({
    "rpc.test": json(200, {
      jsonrpc: "2.0",
      id: 1,
      result: {
        value: [
          {
            executable: true,
            owner: "BPFLoaderUpgradeab1e11111111111111111111111",
            lamports: 1,
            data: ["", "base64"],
          },
        ],
      },
    }),
  });
  const { findings } = await checkOnChainAddresses([hit(TOKEN_PROGRAM, "program")], ctx(f.fetch));
  assert.equal(findings.length, 0);
});
