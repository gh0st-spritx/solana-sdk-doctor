import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatches } from "../src/code";
import { maskJs, maskMarkdown } from "../src/lexer";
import { builtinPack } from "../src/rules/registry";

const file = (path: string, content: string) => ({ path, abs: path, content });
const rule = (id: string) => builtinPack().rules.find((r) => r.id === id)!.code!;
const lines = (id: string, path: string, src: string) => findMatches(rule(id), [file(path, src)]).map((l) => l.line);

test("lexer masks comments but keeps offsets, newlines, strings, regexes and templates intact", () => {
  const src = [
    `const a = "// not a comment"; // real comment`,
    `/* block`,
    `   spans lines */ const b = /\\/*x/; const c = \`t\${ "}" + d }// still template\`;`,
  ].join("\n");
  const { code, skeleton } = maskJs(src);
  assert.equal(code.length, src.length);
  assert.equal(code.split("\n").length, 3);
  assert.match(code, /"\/\/ not a comment"/);
  assert.doesNotMatch(code, /real comment|block|spans lines/);
  assert.match(code, /\/\\\/\*x\//, "regex literal containing /* is not a comment opener");
  assert.match(code, /\/\/ still template/, "template text is not a comment");
  assert.doesNotMatch(skeleton, /not a comment|still template/, "skeleton blanks literal contents");
});

test("call-site rules skip // and /* */ comments in .ts/.js", () => {
  const src = [
    `// const { blockhash } = await connection.getRecentBlockhash();`,
    `/* legacy:`,
    `   connection.getConfirmedTransaction(sig) */`,
    `const s = "see https://example.com"; await connection.getFees();`,
    `await connection.getLatestBlockhash(); // was connection.getRecentBlockhash()`,
  ].join("\n");
  assert.deepEqual(lines("SOLANA-REMOVED-RPC-METHODS", "send.ts", src), [4]);
  assert.deepEqual(lines("SOLANA-REMOVED-RPC-METHODS", "send.js", src), [4]);
  assert.deepEqual(lines("SOLANA-PUBLIC-RPC-HARDCODED", "c.ts", `// fallback: https://api.mainnet-beta.solana.com\nnew Connection(process.env.RPC!);`), []);
});

test("markdown: prose and code fences still match; comments inside JS/TS fences do not", () => {
  const md = [
    "Call `connection.getFees()` to estimate fees.", // 1 prose
    "```ts",
    "// old: connection.getRecentBlockhash()", // 3 comment in ts fence
    "const { blockhash } = await connection.getRecentBlockhash();", // 4
    "```",
    "```bash",
    "node -e 'c.getFees()' # shell", // 7
    "```",
  ].join("\n");
  assert.deepEqual(lines("SOLANA-REMOVED-RPC-METHODS", "README.md", md), [1, 4, 7]);
  assert.equal(maskMarkdown(md).code.length, md.length);
});

test("includeComments opts back in to raw matching", () => {
  const src = `// TODO(drift): getRecentBlockhash`;
  assert.equal(findMatches({ pattern: "getRecentBlockhash" }, [file("a.ts", src)]).length, 0);
  assert.equal(findMatches({ pattern: "getRecentBlockhash", includeComments: true }, [file("a.ts", src)]).length, 1);
});

test("confirmTransaction: only the string-signature form is flagged", () => {
  const src = [
    `const strategyVar = { signature: sig, blockhash, lastValidBlockHeight };`,
    `await connection.confirmTransaction(strategyVar);`, // 2 strategy object: OK
    `await connection.confirmTransaction(strategyVar, "confirmed");`, // 3 OK
    `const sig = await connection.sendRawTransaction(raw);`,
    `await connection.confirmTransaction(sig, "confirmed");`, // 5 FLAG (name + sendRawTransaction)
    `await connection.confirmTransaction("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnb");`, // 6 FLAG literal
    `await connection.confirmTransaction(result.signature);`, // 7 FLAG member .signature
    `const landed = await connection.sendTransaction(tx, [payer]);`,
    `await connection.confirmTransaction(landed);`, // 9 FLAG (assigned from sendTransaction)
    `const check = (id: TransactionSignature) => connection.confirmTransaction(id);`, // 10 FLAG typed param
    `await connection.confirmTransaction(somethingUnknown);`, // 11 unknown: not flagged
    `// await connection.confirmTransaction(sig);`, // 12 comment
    `await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });`, // 13 OK
  ].join("\n");
  assert.deepEqual(lines("SOLANA-CONFIRM-TX-STRING", "send.ts", src), [5, 6, 7, 9, 10]);
});

test("Hermes: an accessToken elsewhere in the file does not mark a keyless client as fixed", () => {
  const src = [
    `const accessToken = process.env.PYTH_HERMES_ACCESS_TOKEN; // declared, never passed`,
    `export const keyless = new HermesClient("https://hermes.pyth.network", {});`, // 2 still broken
    `const hermesOptions = { accessToken };`,
    `export const viaOptions = new HermesClient(HERMES_URL, hermesOptions);`, // 4 fixed via options object
    `export const inline = new HermesClient(HERMES_URL, { accessToken: process.env.T });`, // 5 fixed inline
    `const base = { headers: { Authorization: \`Bearer \${token}\` } };`,
    `export const viaSpread = new HermesClient(HERMES_URL, { ...base, timeout: 5000 });`, // 7 fixed via spread
    `export const commented = new HermesClient(HERMES_URL, {`, // 8 still broken
    `  timeout: 5000, // accessToken: TODO`,
    `});`,
  ].join("\n");
  const locs = findMatches(rule("PYTH-HERMES-KEYLESS-401"), [file("prices.ts", src)]);
  assert.deepEqual(
    locs.map((l) => [l.line, l.mitigated]),
    [[2, false], [4, true], [5, true], [7, true], [8, false]],
  );
});

test("raw Hermes endpoint: mitigation is tied to the enclosing request, not the file", () => {
  const src = [
    `const headers = { Authorization: "Bearer " + token };`,
    `const a = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=1");`, // 2 keyless
    `const b = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=1", { headers });`, // 3 ok
    `const es = new EventSource("https://hermes.pyth.network/v2/updates/price/stream?ids[]=1&ACCESS_TOKEN=" + token);`, // 4 ok
    `const URL_OK = "https://hermes.pyth.network/v2/updates/price/latest";`, // 5 ok: every use is authed
    `await fetch(URL_OK, { headers: { Authorization: auth } });`,
    `const URL_BAD = "https://hermes.pyth.network/v2/updates/price/latest";`, // 7 used keyless
    `await fetch(URL_BAD);`,
  ].join("\n");
  const locs = findMatches(rule("PYTH-HERMES-RAW-ENDPOINT"), [file("raw.ts", src)]);
  assert.deepEqual(
    locs.map((l) => [l.line, l.mitigated]),
    [[2, false], [3, true], [4, true], [5, true], [7, false]],
  );
});
