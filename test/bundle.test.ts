import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(__dirname, "..");
const committed = join(root, "action-dist/cli.js");

test("action-dist/cli.js (used by the GitHub Action) is up to date with src/", () => {
  const out = mkdtempSync(join(tmpdir(), "sdk-doctor-bundle-"));
  const r = spawnSync(process.execPath, [join(root, "scripts/bundle.mjs"), "--outdir", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readFileSync(join(out, "cli.js"), "utf8") === readFileSync(committed, "utf8"), "stale bundle: run `npm run bundle`");
});

test("action-dist/cli.js runs standalone (no node_modules) and needs only Node built-ins", () => {
  const src = readFileSync(committed, "utf8");
  const requires = [...src.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(requires.filter((r) => !r.startsWith("node:")), []);
  const r = spawnSync(process.execPath, [committed, join(root, "fixtures/demo-dapp"), "--offline", "--json"], {
    encoding: "utf8",
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? "", NO_COLOR: "1" },
  });
  assert.equal(r.status, 1, r.stderr);
  assert.ok(JSON.parse(r.stdout).summary.fail >= 4);
});
