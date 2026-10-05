import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAddresses, isValidPubkey } from "../src/addresses";
import type { SourceFile } from "../src/scanner";

const file = (path: string, content: string): SourceFile => ({ path, abs: "/v/" + path, content });

test("isValidPubkey accepts real Solana addresses and rejects junk", () => {
  assert.ok(isValidPubkey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"));
  assert.ok(isValidPubkey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"));
  assert.ok(!isValidPubkey("not-a-key"));
  assert.ok(!isValidPubkey("DeadBeef1111111111111111111111111111111111")); // 31 bytes
});

test("extracts new PublicKey literals and named PROGRAM_ID constants", () => {
  const hits = extractAddresses([
    file(
      "src/a.ts",
      `
const PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const other = "random string that looks long enough maybe but is not base58!!!!!";
const priceFeed = new web3.PublicKey("H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG");
`,
    ),
  ]);
  assert.equal(hits.length, 2);
  assert.ok(hits.some((h) => h.kind === "program" && (h.name === "PROGRAM_ID" || h.snippet.includes("PROGRAM_ID"))));
  assert.ok(hits.some((h) => h.pubkey.startsWith("H6AR") && (h.kind === "feed" || h.name === "priceFeed")));
});

test("skips addresses inside comments (comment-aware)", () => {
  const hits = extractAddresses([
    file(
      "src/b.ts",
      `
// const OLD = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
/* new PublicKey("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s") */
`,
    ),
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].pubkey, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
});

test("cluster map values are extracted", () => {
  const hits = extractAddresses([
    file(
      "src/cluster.ts",
      `const clusterToPythProgramKey = {
  'mainnet-beta': 'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH',
  devnet: 'gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s',
};`,
    ),
  ]);
  assert.equal(hits.length, 2);
});
