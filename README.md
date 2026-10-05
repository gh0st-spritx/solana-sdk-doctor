# 🩺 solana-sdk-doctor

**Catch docs-vs-reality drift in Solana & oracle SDKs before your users do.**

`solana-sdk-doctor` is a CLI + GitHub Action that scans a repo's Solana / oracle
dependencies and source code, then checks them against a registry of known drift:
dead keyless endpoints, JSON-RPC methods removed from validators, renamed or
deprecated packages, breaking constructor changes that tutorials still teach,
and hard-coded program/feed addresses that are missing or non-executable on-chain.
In **live mode** it actually probes the documented endpoints, so the report says
*what the network does today*, not what a README said a year ago.

```
npx solana-sdk-doctor .        # (after publish) – or, from a clone with no build step: node action-dist/cli.js .
```

---

## The problem

Solana moves fast. SDK READMEs, quickstarts, blog posts and AI-generated code do not.
The result is code that **type-checks, builds, and then fails at runtime**:

| Drift | What you see |
|---|---|
| A keyless public endpoint now needs an API key | `401 unauthorized` in production |
| Validator RPC removed a method the SDK still exposes | `-32601 Method not found` |
| A package was renamed / deprecated | silent staleness, no fixes, no new IDL support |
| A constructor signature changed | wrong argument in the wrong slot |

None of these are caught by `tsc`, `eslint`, or `npm audit`.

### The real bug that started this: Pyth Hermes Quickstart → HTTP 401

The `@pythnetwork/hermes-client` README (still true for the latest **3.1.0**, checked 2026-10-04) teaches:

```ts
const connection = new HermesClient("https://hermes.pyth.network", {}); // no credentials
const priceUpdates = await connection.getLatestPriceUpdates(priceIds);
```

But the endpoint now rejects keyless price updates:

```console
$ curl -i "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
HTTP/2 401
content-type: text/plain; charset=utf-8

unauthorized
```

What makes it nasty:

* the Quickstart's *first* call (`getPriceFeeds` → `/v2/price_feeds`) still returns **200**, so it looks like it works;
* the docs site banner says "Hermes now requires an API Key", but the npm README does not;
* the fix (`accessToken`, sent as `Authorization: Bearer …`) only exists in **3.1.0+** — 2.x users need to hand-roll headers.

`solana-sdk-doctor` flags all of that, with file:line and a live probe as evidence:

```
FAIL PYTH-HERMES-KEYLESS-401 in package.json
  Keyless Hermes Quickstart now returns HTTP 401
  probe  [live] GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62d…5b43
         → HTTP 401 "unauthorized" (128ms)
  at     README.md:6  const connection = new HermesClient("https://hermes.pyth.network", {});
  at     src/prices.ts:4  const connection = new HermesClient("https://hermes.pyth.network", {});
  fix    Upgrade to @pythnetwork/hermes-client >= 3.1.0 and pass `{ accessToken: process.env.PYTH_HERMES_ACCESS_TOKEN }` …
```

---

## Install

Requires Node.js ≥ 18.18 (20+ recommended).

```bash
git clone <this repo> && cd solana-sdk-doctor
npm install
npm run build
node dist/cli.js path/to/your/repo
# or link it globally
npm link && solana-sdk-doctor path/to/your/repo
```

> npm publishing (`npx solana-sdk-doctor`) is on the roadmap; not published yet.

## Usage

```bash
solana-sdk-doctor [path] [options]
solana-sdk-doctor rules             # list loaded rules
```

| Option | Description |
|---|---|
| `--offline` | No network. Use each rule's cached, dated verdict (`verified` block). |
| `--format table\|json\|markdown` | Output format (default `table`). `--json` is a shorthand. |
| `-o, --output <file>` | Also write the report; repeatable. `.json` → JSON, `.md` → Markdown, else plain table. |
| `--rules <file>` | Load an extra rule pack (repeatable). Same `id` overrides a built-in rule. |
| `--disable <ids>` | Comma-separated rule ids to skip. |
| `--no-builtin` | Only use rules from `--rules`. |
| `--fail-on fail\|warn\|never` | Exit-code threshold (default `fail`). |
| `--rpc <url\|solami>` | RPC endpoint, or the keyword `solami` (uses `SOLAMI_API_KEY`). Alias: `--rpc-url`. Default: Solami when `SOLAMI_API_KEY` is set, else `$SOLANA_RPC_URL`, else public mainnet-beta. |
| `--timeout <ms>` | Per-probe timeout (default 8000). |
| `--no-onchain` | Skip on-chain address drift checks. |
| `-v, --verbose` | Details for passing rows too. |
| `--no-color` | Disable colors (also honours `NO_COLOR`). |

**Exit codes:** `0` clean · `1` drift at/above `--fail-on` · `2` usage/config error.

### Try it on the bundled fixtures

```bash
npm run build
node dist/cli.js fixtures/demo-dapp            # live probes  -> exit 1
node dist/cli.js fixtures/demo-dapp --offline  # cached rules -> exit 1
node dist/cli.js fixtures/healthy-dapp         # same features, current APIs -> exit 0
node dist/cli.js fixtures/demo-dapp --format markdown   # what the PR comment looks like
```

`fixtures/demo-dapp` is a small monorepo built by copy-pasting popular quickstarts
(Pyth Hermes, web3.js 1.x tutorials, pre-0.30 Anchor, a legacy bot package).
`fixtures/healthy-dapp` does the same things against current APIs.

Sample (live, 2026-10-04, `COLUMNS=160`):

```
🩺 solana-sdk-doctor v0.1.0  ·  live mode  ·  12 rules  ·  2 package.json

  STATUS  RULE                                  PACKAGE                                  FINDING                              EVIDENCE
  ──────  ────────────────────────────────────  ───────────────────────────────────────  ───────────────────────────────────  ──────────────────────────────────
  📦 package.json
  FAIL    ANCHOR-PROGRAM-CTOR-0.30              @coral-xyz/anchor@0.30.1                 Pre-0.30 new Program(idl, programI…  1 call site
  FAIL    PYTH-HERMES-KEYLESS-401               @pythnetwork/hermes-client@3.1.0         Keyless Hermes Quickstart now retu…  live: HTTP 401 "unauthorized"
  FAIL    PYTH-HERMES-RAW-ENDPOINT              (source code)                            Raw keyless calls to hermes.pyth.n…  live: HTTP 401 "unauthorized"
  FAIL    SOLANA-REMOVED-RPC-METHODS            @solana/web3.js@1.95.0                   Calls RPC methods removed from val…  live: -32601 "Method not found"
  WARN    ANCHOR-RENAMED-ANCHOR-LANG-CORE       @coral-xyz/anchor@0.30.1                 Renamed to @anchor-lang/core in An…  live: @anchor-lang/core@1.2.0 is …
  WARN    SOLANA-CONFIRM-TX-STRING              @solana/web3.js@1.95.0                   Deprecated confirmTransaction(sign…  1 call site
  WARN    SOLANA-PUBLIC-RPC-HARDCODED           (source code)                            Hard-coded public mainnet-beta RPC…  1 call site
  INFO    SOLANA-WEB3JS-V1-MAINTENANCE          @solana/web3.js@1.95.0                   web3.js 1.x is in maintenance mode   live: @solana/kit@8.4.0 is publis…
  📦 packages/legacy-bot/package.json
  FAIL    PYTH-HERMES-KEYLESS-401               @pythnetwork/hermes-client@2.1.0         Keyless Hermes Quickstart now retu…  live: HTTP 401 "unauthorized"
  WARN    ANCHOR-PROJECT-SERUM-PACKAGE          @project-serum/anchor@0.26.0             Abandoned package (last release 20…  live: @anchor-lang/core@1.2.0 is …
  WARN    PYTH-HERMES-NO-ACCESSTOKEN-OPTION     @pythnetwork/hermes-client@2.1.0         No `accessToken` option before 3.1…  static rule
  WARN    PYTH-PRICE-SERVICE-CLIENT-DEPRECATED  @pythnetwork/price-service-client@1.9.0  Package is deprecated on npm         live: npm deprecated 1.11.0: "Thi…

Summary: 5 fail, 6 warn, 1 info, 0 pass
```

(Each non-passing row is followed by a details block: probe target + result, file:line call sites, fix, docs link.)

On narrow terminals the table degrades instead of wrapping into noise: package names shorten (keeping the
version), then the EVIDENCE and PACKAGE columns drop, and below ~65 columns rows stack vertically. The
details blocks always carry the full text, word-wrapped to the terminal. Width comes from the TTY, or `COLUMNS`.

## Live on-chain checks (Solami)

Live mode does two extra things against a real Solana JSON-RPC endpoint:

1. **Removed-RPC probes** — the existing `SOLANA-REMOVED-RPC-METHODS` rule POSTs deprecated methods (e.g. `getRecentBlockhash`) and reports `-32601 Method not found` when validators have dropped them.
2. **On-chain address drift** — extracts hard-coded base58 pubkeys from source (`new PublicKey("…")`, `PROGRAM_ID` / feed constants, cluster maps; comment-aware), batch-queries them with `getMultipleAccounts`, and flags:
   - account missing/closed → **FAIL**
   - program ID not executable → **FAIL**
   - owner mismatch vs a small known table (Token, Pyth receiver/push oracle, Metaplex, …) → **WARN**
   - known devnet-only address used while probing mainnet → **WARN**

Timeouts and rate limits are **inconclusive** (never fail the build by themselves). The report header shows the RPC provider, current slot, and latency. **API keys are never logged** (redacted to `***` in every format).

### With Solami (recommended for the sidetrack demo)

1. Create an account / key at [solami.dev/signup](https://solami.dev/signup) (free tier: no card; Superteam promo: `?ref=st-earn-sep-26`).
2. Export the key and point the doctor at Solami:

```bash
export SOLAMI_API_KEY=sk_…          # never commit this
npm run build

# keyword form — constructs https://rpc.solami.dev/sol?api_key=…
node dist/cli.js fixtures/demo-dapp --rpc solami

# equivalent: auto-select Solami whenever SOLAMI_API_KEY is set
node dist/cli.js fixtures/demo-dapp

# any other Solana JSON-RPC also works
node dist/cli.js fixtures/demo-dapp --rpc https://api.mainnet-beta.solana.com
```

Solami endpoint facts (from [solami.dev/docs/endpoints](https://solami.dev/docs/endpoints)):

| Product | URL | Auth |
|---|---|---|
| JSON-RPC | `https://rpc.solami.dev/sol` | `?api_key=` |
| WebSocket | `wss://ws.solami.dev/ws/sol` | `?api_key=` |
| Data / account API | `https://api.solami.dev` | `Bearer` or `?api_key=` |

Region pin: `https://fra.rpc.solami.dev/sol?api_key=…` (also `nyc`, `ams`). Free tier ≈ 10 rps.

### GitHub Action

```yaml
- uses: gh0st-spritx/solana-sdk-doctor@master
  with:
    path: .
    rpc-url: solami
    solami-api-key: ${{ secrets.SOLAMI_API_KEY }}
```

## How it works

```
package.json(s) ──► scanner ──► detected SDKs + resolved versions (node_modules > package-lock > range minimum)
source + docs   ──►          ──► code matches (file:line, mitigated?)
                                   │
rule registry (JSON) ─────────────►│ engine: version gate → code gate → mitigation → probe
                                   │
                       live probe (http | jsonrpc | npm-deprecated | npm-published)
                       + on-chain getMultipleAccounts (address drift)
                       or --offline cached verdict
                                   ▼
                     table / json / markdown  +  CI exit code
```

* **Docs are scanned too** (`.md`/`.mdx`): if *your* README teaches the dead quickstart, you get a finding.
* **Comment-aware:** a small length-preserving lexer masks `//` and `/* */` comments in JS/TS (and in
  JS/TS-tagged Markdown fences), so `// old: connection.getRecentBlockhash()` is not a hit. Strings, template
  literals and regex literals are understood, so `"https://…"` is never mistaken for a comment.
* **Mitigation is scoped to the call site:** a `HermesClient` is a PASS only if *that* constructor call carries
  `accessToken`/`Authorization` - inline, or via an options object / spread it references
  (`new HermesClient(url, hermesOptions)` → `const hermesOptions = { accessToken }`). An `accessToken` mentioned
  elsewhere in the file does not hide a keyless client. Raw `fetch("https://hermes…")` calls are judged by
  their own request options the same way. When every call site is fixed, no probe is sent.
* **Argument-aware:** `confirmTransaction(sig)` is flagged only when the argument is (very likely) a bare
  signature string - a literal, a `sig`/`signature`/`txid`-named value, a value assigned from
  `sendRawTransaction(...)`, or a `string`/`TransactionSignature`-typed one. A strategy object
  (`confirmTransaction(strategy)`) or anything unresolvable is left alone.
* **Self-healing rules:** if a live probe shows upstream behaves as documented again, the finding becomes PASS with
  "rule may be stale" instead of crying wolf.
* **Flaky network ≠ false alarm:** timeouts / 429s / 5xx are *inconclusive* and fall back to the rule's cached, dated verdict.
* **Monorepos:** every `package.json` is analysed; each source file belongs to its nearest manifest; identical probes run once.

## Built-in rules (v2026.10.04)

| Id | Package | Severity | Probe |
|---|---|---|---|
| `PYTH-HERMES-KEYLESS-401` | @pythnetwork/hermes-client | fail | HTTP: keyless `/v2/updates/price/latest` → 401 |
| `PYTH-HERMES-RAW-ENDPOINT` | (source) raw `hermes.pyth.network` calls | fail | same |
| `PYTH-HERMES-NO-ACCESSTOKEN-OPTION` | hermes-client `<3.1.0` | warn | static |
| `PYTH-PRICE-SERVICE-CLIENT-DEPRECATED` | @pythnetwork/price-service-client | warn | npm deprecation notice |
| `SOLANA-REMOVED-RPC-METHODS` | @solana/web3.js `<2` + `getRecentBlockhash`/`getConfirmedTransaction`/`getFees`/… | fail | JSON-RPC → `-32601` |
| `SOLANA-CONFIRM-TX-STRING` | @solana/web3.js + `confirmTransaction(sig)` | warn | static |
| `SOLANA-WEB3JS-V1-MAINTENANCE` | @solana/web3.js `<2` | info | npm: `@solana/kit` published |
| `SOLANA-WEB3JS-V2-RENAMED` | @solana/web3.js `>=2` | warn | npm deprecation notice |
| `SOLANA-PUBLIC-RPC-HARDCODED` | (source) `api.mainnet-beta.solana.com` | warn | static |
| `ANCHOR-PROJECT-SERUM-PACKAGE` | @project-serum/anchor | warn | npm: successor published |
| `ANCHOR-PROGRAM-CTOR-0.30` | @coral-xyz/anchor `>=0.30` + `new Program(idl, programId, provider)` | fail | static |
| `ANCHOR-RENAMED-ANCHOR-LANG-CORE` | @coral-xyz/anchor | warn | npm: `@anchor-lang/core` published |
| `ONCHAIN-ACCOUNT-MISSING` | hard-coded pubkey (live) | fail | `getMultipleAccounts` → null |
| `ONCHAIN-PROGRAM-NOT-EXECUTABLE` | program-id context (live) | fail | account exists, `executable=false` |
| `ONCHAIN-OWNER-MISMATCH` | known program table (live) | warn | owner ≠ expected loader/host |
| `ONCHAIN-DEVNET-ON-MAINNET` | known-devnet address (live) | warn | e.g. Pyth devnet oracle on mainnet RPC |

`solana-sdk-doctor rules` prints the live list (built-ins + on-chain family).

## Writing rules

Rules are plain JSON (see [`src/rules/builtin.json`](src/rules/builtin.json) and
[`examples/custom-rules.json`](examples/custom-rules.json)). Load your own pack with `--rules`.

```jsonc
{
  "name": "my-team-rules",
  "rules": [
    {
      "id": "ACME-V1-SUNSET",
      "package": "@acme/oracle-sdk",          // omit for code-only rules (then code.required must be true)
      "versions": "<2.0.0",                   // semver range, default "*"
      "severity": "fail",                     // info | warn | fail
      "title": "Acme v1 endpoints are sunset",
      "summary": "Why this breaks.",
      "fix": "What to do instead.",
      "docs": ["https://acme.dev/migrate"],
      "code": {
        "pattern": "new\\s+AcmeClient\\s*\\(",  // JS regex over .js/.ts/.jsx/.tsx/.mjs/.cjs/.vue/.svelte/.md/.mdx
        "required": false,                      // true = only fire when the pattern matches
        "mitigatedBy": "apiKey",                // call site already fixed?
        "mitigationScope": "call",              // "call" (default): that call's arguments + options objects they
                                                //   reference in the same file | "file": anywhere in the file
        "includeComments": false,               // default: skip JS/TS comments (and comments in js/ts md fences)
        "argument": {                           // optional: keep a match only if a named capture looks right
          "group": "arg",                       //   pattern must contain (?<arg>...)
          "names": "(?:sig|signature)$",        //   identifier name (case-insensitive)
          "assignedFrom": "sendRawTransaction", //   or its in-file initializer
          "types": "string|TransactionSignature"//   or its declared type; string literals always count
        }
      },
      "probe": {                                // optional live check
        "kind": "http",                         // http | jsonrpc | npm-deprecated | npm-published
        "url": "https://api.acme.dev/v1/price",
        "driftWhen": { "status": [401, 410] }
      },
      "verified": { "date": "2026-10-04", "drift": true, "detail": "GET /v1/price -> 410" }
    }
  ]
}
```

Probe kinds:

* `http` – `driftWhen.status` / `driftWhen.bodyIncludes`; healthy on 2xx (or `healthyWhen.status`).
* `jsonrpc` – POSTs `{method, params}` to `url` (`{{rpcUrl}}` = `--rpc-url`); drift on `driftWhen.rpcErrorCode`.
* `npm-deprecated` – drift if `package@version` (default `latest`) carries an npm deprecation notice.
* `npm-published` – drift if a successor `package` exists on npm (renames).

Rules with a probe should carry a `verified` block so `--offline` stays useful. The test suite enforces this for built-ins.

## GitHub Action

```yaml
# .github/workflows/solana-sdk-doctor.yml
name: solana-sdk-doctor
on:
  pull_request:
  schedule:
    - cron: "0 6 * * 1"   # weekly – upstream can drift even when your code doesn't
permissions:
  contents: read
  pull-requests: write    # sticky PR comment
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: gh0st-spritx/solana-sdk-doctor@master
        with:
          path: .
          fail-on: fail        # or warn
          # offline: "true"    # no network from CI
          # rules: .sdk-doctor/rules.json
          # rpc-url: ${{ secrets.SOLANA_RPC_URL }}
```

What the action does:

1. runs the pre-bundled CLI (`action-dist/cli.js`, zero runtime deps - no `npm install`/build on your runner) and prints the table in the job log;
2. writes the Markdown report to the **job summary**;
3. emits **inline annotations** (`::error file=…,line=…`) on every unmitigated call site;
4. on pull requests, posts or updates **one sticky comment** (matched by a hidden marker);
5. fails the job when findings reach `fail-on`.

| Input | Default | |
|---|---|---|
| `path` | `.` | directory to scan |
| `offline` | `false` | cached verdicts only |
| `fail-on` | `fail` | `fail` \| `warn` \| `never` |
| `rules` | | extra rule packs (comma/newline separated) |
| `disable` | | rule ids to skip |
| `rpc-url` | | RPC URL or `solami` |
| `solami-api-key` | | Solami API key (never logged) |
| `comment` | `true` | sticky PR comment |
| `github-token` | `github.token` | needs `pull-requests: write` |

Outputs: `exit-code`, `fail-count`, `warn-count`, `report-json`, `report-markdown`.

**How the Action ships:** `action-dist/cli.js` is a single-file esbuild bundle of `src/` + `semver` + the built-in
rule pack, committed to the repo (the standard approach for JavaScript Actions). `uses:` therefore needs no
install or compile step and can't break on a registry hiccup. `npm run bundle` regenerates it; CI and the test
suite fail if it is stale. `dist/` (plain `tsc` output with `.d.ts` files) stays git-ignored - it is only for the
npm package / programmatic API.

## Programmatic API

```ts
import { diagnose, loadRules, renderMarkdown, exitCodeFor } from "solana-sdk-doctor";

const report = await diagnose("./my-dapp", { rules: loadRules(), offline: false });
console.log(renderMarkdown(report));
process.exitCode = exitCodeFor(report, "warn");
```

## Development

```bash
npm install
npm run typecheck
npm run build       # dist/ (npm package, git-ignored)
npm run bundle      # action-dist/cli.js (GitHub Action, committed) - rerun after any src/ change
npm test            # node:test via tsx; no network (probes use an injected fetch); checks the bundle is fresh
```

## Roadmap

- [x] Live on-chain address drift via Solami / any JSON-RPC (`--rpc solami`, `SOLAMI_API_KEY`)
- [ ] Publish to npm (`npx solana-sdk-doctor`) and tag the Action `v0`
- [ ] More rule packs: Switchboard On-Demand, Jupiter API (v6 → new hosts), Helius/Triton RPC, Metaplex Umi, `@solana/spl-token`, wallet-adapter
- [ ] Rust side: `Cargo.toml` (anchor-lang, solana-program → split crates, pyth-solana-receiver-sdk)
- [ ] Python side: `solana-py`, `anchorpy`
- [ ] AST-based matching (ts-morph / tree-sitter) instead of regex + lexer (cross-file option objects, real type info)
- [ ] `--fix` codemods for mechanical migrations (`getRecentBlockhash` → `getLatestBlockhash`, Anchor import rename)
- [ ] Community rule registry with signed, dated verdicts and a scheduled "re-verify every rule" job that opens PRs when upstream changes
- [ ] SARIF output for GitHub code scanning
- [ ] Upstream reports: auto-draft an issue for the SDK whose README drifted

## License

[MIT](LICENSE)
