import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCall, findMatches } from "../src/code";

const file = (path: string, content: string) => ({ path, abs: path, content });

test("extractCall returns the balanced call expression", () => {
  const src = `new HermesClient(url, { headers: f(a, b), accessToken: t }); next()`;
  assert.equal(extractCall(src, src.indexOf("(")), `(url, { headers: f(a, b), accessToken: t })`);
});

test("findMatches reports file, 1-based line and snippet", () => {
  const locs = findMatches({ pattern: "\\.getRecentBlockhash\\s*\\(" }, [file("a.ts", "const x = 1;\nawait c.getRecentBlockhash();\n")]);
  assert.deepEqual(locs, [{ file: "a.ts", line: 2, snippet: "await c.getRecentBlockhash();", mitigated: false }]);
});

test("call-scoped mitigation inspects only the matched call", () => {
  const src = [
    `const a = new HermesClient("https://hermes.pyth.network", {});`,
    `const b = new HermesClient("https://hermes.pyth.network", {`,
    `  accessToken: process.env.TOKEN,`,
    `});`,
  ].join("\n");
  const locs = findMatches({ pattern: "new\\s+HermesClient\\s*\\(", mitigatedBy: "accessToken" }, [file("p.ts", src)]);
  assert.deepEqual(locs.map((l) => [l.line, l.mitigated]), [[1, false], [2, true]]);
});

test("call-scoped mitigation resolves an options object passed by name; file scope still available", () => {
  const src = `const opts = { accessToken: env.T };\nconst c = new HermesClient(URL, opts);`;
  const call = findMatches({ pattern: "new\\s+HermesClient\\s*\\(", mitigatedBy: "accessToken" }, [file("p.ts", src)]);
  const fileScope = findMatches({ pattern: "new\\s+HermesClient\\s*\\(", mitigatedBy: "accessToken", mitigationScope: "file" }, [file("p.ts", src)]);
  assert.equal(call[0].mitigated, true);
  assert.equal(fileScope[0].mitigated, true);
});

test("Anchor pre-0.30 constructor pattern matches 3-arg form only", () => {
  const pattern = "new\\s+(?:anchor\\.)?Program\\s*(?:<[^>]*>)?\\s*\\(\\s*[^,()]+,\\s*[^,()]+,\\s*[^,()]+\\)";
  const hits = (s: string) => findMatches({ pattern }, [file("x.ts", s)]).length;
  assert.equal(hits("new anchor.Program(idl as anchor.Idl, programId, provider)"), 1);
  assert.equal(hits("new Program<MyProg>(idl, PROGRAM_ID, provider)"), 1);
  assert.equal(hits("new Program(idl as MyProg, provider)"), 0);
  assert.equal(hits("new Program(idl)"), 0);
});
