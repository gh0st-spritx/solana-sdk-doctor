import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { diagnose } from "../src/engine";
import { builtinPack } from "../src/rules/registry";
import { compactDetail, renderTable, truncatePackage, wrap } from "../src/report/table";

const demo = join(__dirname, "..", "fixtures/demo-dapp");
const rules = builtinPack().rules;
const visible = (s: string) => [...s].length + (s.match(/[\u{1F300}-\u{1FAFF}]/gu)?.length ?? 0); // emoji are 2 cols

test("table degrades gracefully: no line overflows the terminal (except unbreakable URLs/tokens)", async () => {
  const report = await diagnose(demo, { rules, offline: true, now: () => new Date("2026-10-04T00:00:00Z") });
  for (const width of [200, 160, 120, 100, 80, 60, 40]) {
    const out = renderTable(report, { width });
    for (const line of out.split("\n")) {
      if (visible(line) <= width) continue;
      const longest = Math.max(...line.split(/\s+/).map((t) => t.length));
      assert.ok(longest > width - 14, `width ${width}: line overflows without an unbreakable token: ${JSON.stringify(line)}`);
    }
    // Every finding is still listed with its rule id and has full detail below the table.
    for (const f of report.findings) assert.ok(out.includes(f.ruleId), `width ${width}: ${f.ruleId} missing`);
    assert.ok(out.includes(report.findings.find((f) => f.ruleId === "PYTH-HERMES-KEYLESS-401")!.fix.split(" ")[0]));
  }
});

test("table picks richer layouts on wider terminals", async () => {
  const report = await diagnose(demo, { rules, offline: true });
  const header = (width: number) => renderTable(report, { width }).split("\n").find((l) => l.includes("STATUS")) ?? "";
  assert.match(header(160), /PACKAGE\s+FINDING\s+EVIDENCE/);
  assert.match(header(120), /PACKAGE\s+FINDING\s+EVIDENCE/);
  assert.match(header(100), /PACKAGE\s+FINDING$/);
  assert.match(header(80), /RULE\s+FINDING$/);
  assert.equal(header(50), "", "very narrow terminals use stacked rows, no header");
  assert.match(renderTable(report, { width: 50 }), /\n {2}FAIL {2}PYTH-HERMES-KEYLESS-401\n {8}Keyless Hermes/);
  assert.match(renderTable(report, { width: 80 }), /package \+ evidence columns hidden/);
});

test("compactDetail keeps just the probe outcome for table cells", () => {
  assert.equal(compactDetail('GET /v2/updates/price/latest (keyless) -> HTTP 401 "unauthorized" (verified 2026-10-04)'), 'HTTP 401 "unauthorized"');
  assert.equal(compactDetail("live probe inconclusive (HTTP 503); using cached: getRecentBlockhash -> -32601 Method not found (verified 2026-10-04)"), "-32601 Method not found");
  assert.equal(compactDetail("@solana/kit@8.4.0 is published"), "@solana/kit@8.4.0 is published");
});

test("truncatePackage keeps the version; wrap keeps a hanging indent", () => {
  assert.equal(truncatePackage("@pythnetwork/price-service-client@1.9.0", 24), "@pythnetwork/pric…@1.9.0");
  assert.equal(truncatePackage("@solana/web3.js@1.95.0", 30), "@solana/web3.js@1.95.0");
  assert.deepEqual(wrap("aa bb cc dd", 9, "  fix ", "      "), ["  fix aa", "      bb", "      cc", "      dd"]);
  assert.deepEqual(wrap("see https://example.com/a/very/long/url ok", 12, "> "), ["> see", "  https://example.com/a/very/long/url", "  ok"]);
});
