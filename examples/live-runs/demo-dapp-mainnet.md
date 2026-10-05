<!-- solana-sdk-doctor-report -->
### 🩺 Solana SDK Doctor — ❌ SDK drift detected

**8** fail · **7** warn · **1** info · **0** pass — live mode, 16 rules, 2 package.json

RPC: provider `public-mainnet` · `https://api.mainnet-beta.solana.com` · slot **453501256** · latency **78ms** · on-chain addrs **3**

| | Rule | Package | Finding | Evidence |
|---|---|---|---|---|
| ❌ | `ANCHOR-PROGRAM-CTOR-0.30` | `@coral-xyz/anchor@0.30.1`<br><sub>package.json</sub> | Pre-0.30 new Program(idl, programId, provider) | 1 call site(s) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_<br><sub>package.json</sub> | Hard-coded account missing or closed on-chain | live: gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_<br><sub>package.json</sub> | Hard-coded account missing or closed on-chain | live: 61xbcX6texMRKS4qzDhbGEnjenYLJTHD8wXypY2BnaHz → null (missing/closed) |
| ❌ | `ONCHAIN-PROGRAM-NOT-EXECUTABLE` | _source_<br><sub>package.json</sub> | Hard-coded program ID is not executable on-chain | live: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS → executable=false (owner 11111111111111111111111111111111) |
| ❌ | `PYTH-HERMES-KEYLESS-401` | `@pythnetwork/hermes-client@3.1.0`<br><sub>package.json</sub> | Keyless Hermes Quickstart now returns HTTP 401 | live: HTTP 401 "unauthorized" |
| ❌ | `PYTH-HERMES-RAW-ENDPOINT` | _source_<br><sub>package.json</sub> | Raw keyless calls to hermes.pyth.network | live: HTTP 401 "unauthorized" |
| ❌ | `SOLANA-REMOVED-RPC-METHODS` | `@solana/web3.js@1.95.0`<br><sub>package.json</sub> | Calls RPC methods removed from validators | live: getRecentBlockhash -> -32601 "Method not found" |
| ❌ | `PYTH-HERMES-KEYLESS-401` | `@pythnetwork/hermes-client@2.1.0`<br><sub>packages/legacy-bot/package.json</sub> | Keyless Hermes Quickstart now returns HTTP 401 | live: HTTP 401 "unauthorized" |
| ⚠️ | `ANCHOR-RENAMED-ANCHOR-LANG-CORE` | `@coral-xyz/anchor@0.30.1`<br><sub>package.json</sub> | Renamed to @anchor-lang/core in Anchor 1.0 | live: @anchor-lang/core@1.2.0 is published |
| ⚠️ | `ONCHAIN-DEVNET-ON-MAINNET` | _source_<br><sub>package.json</sub> | Known devnet-only address used in a mainnet context | live: gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s flagged as devnet-only while probing public-mainnet |
| ⚠️ | `SOLANA-CONFIRM-TX-STRING` | `@solana/web3.js@1.95.0`<br><sub>package.json</sub> | Deprecated confirmTransaction(signature) | 1 call site(s) |
| ⚠️ | `SOLANA-PUBLIC-RPC-HARDCODED` | _source_<br><sub>package.json</sub> | Hard-coded public mainnet-beta RPC URL | 1 call site(s) |
| ⚠️ | `ANCHOR-PROJECT-SERUM-PACKAGE` | `@project-serum/anchor@0.26.0`<br><sub>packages/legacy-bot/package.json</sub> | Abandoned package (last release 2022) | live: @anchor-lang/core@1.2.0 is published |
| ⚠️ | `PYTH-HERMES-NO-ACCESSTOKEN-OPTION` | `@pythnetwork/hermes-client@2.1.0`<br><sub>packages/legacy-bot/package.json</sub> | No `accessToken` option before 3.1.0 | static rule |
| ⚠️ | `PYTH-PRICE-SERVICE-CLIENT-DEPRECATED` | `@pythnetwork/price-service-client@1.9.0`<br><sub>packages/legacy-bot/package.json</sub> | Package is deprecated on npm | live: npm deprecated 1.11.0: "This package is deprecated and is no longer maintained. Please use @pythnetwork/hermes-client instead." |
| ℹ️ | `SOLANA-WEB3JS-V1-MAINTENANCE` | `@solana/web3.js@1.95.0`<br><sub>package.json</sub> | web3.js 1.x is in maintenance mode | live: @solana/kit@8.4.0 is published |

<details><summary>Details & fixes</summary>

#### ❌ `ANCHOR-PROGRAM-CTOR-0.30` — Pre-0.30 new Program(idl, programId, provider)
_package.json_

Since Anchor 0.30 the constructor is `new Program(idl, provider?)`; the program id is read from `idl.address`. The old 3-argument form, still common in tutorials, passes the programId where the provider is expected.

- `src/program.ts:10` — `export const program = new anchor.Program(idl as anchor.Idl, programId, provider);`
- **Fix:** Use `new Program(idl as MyProgram, provider)` with a 0.30+ IDL that contains `address`.
- **Docs:** <https://www.anchor-lang.com/docs/updates/release-notes/0-30-0>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/program.ts:13` — `export const PYTH_PROGRAM_ID = new PublicKey("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");`
- **Note:** gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/program.ts:16` — `export const DEAD_ACCOUNT = new PublicKey("61xbcX6texMRKS4qzDhbGEnjenYLJTHD8wXypY2BnaHz");`
- **Note:** 61xbcX6texMRKS4qzDhbGEnjenYLJTHD8wXypY2BnaHz → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-PROGRAM-NOT-EXECUTABLE` — Hard-coded program ID is not executable on-chain
_package.json_

A pubkey used as a program ID (PublicKey passed to Program / named PROGRAM_ID / similar) exists but executable=false. Calling it as a program will fail at runtime.

- `src/program.ts:6` — `const programId = new anchor.web3.PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");`
- **Note:** Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS owner=11111111111111111111111111111111 executable=false
- **Fix:** Use the deployed program id for this cluster (check `solana program show` / the project's Anchor declare_id / IDL address).
- **Docs:** <https://solana.com/docs/rpc/http/getaccountinfo>

#### ❌ `PYTH-HERMES-KEYLESS-401` — Keyless Hermes Quickstart now returns HTTP 401
_package.json_

The hermes-client README Quickstart builds `new HermesClient("https://hermes.pyth.network", {})` with no credentials. The public endpoint now rejects keyless price-update requests (/v2/updates/price/latest) with `401 unauthorized`, so getLatestPriceUpdates() and SSE streams fail at runtime.

- `README.md:6` — `const connection = new HermesClient("https://hermes.pyth.network", {});`
- `src/prices.ts:4` — `const connection = new HermesClient("https://hermes.pyth.network", {});`
- **Fix:** Upgrade to @pythnetwork/hermes-client >= 3.1.0 and pass `{ accessToken: process.env.PYTH_HERMES_ACCESS_TOKEN }` (sent as `Authorization: Bearer *** or point the client at a provider-hosted Hermes endpoint.
- **Docs:** <https://www.npmjs.com/package/@pythnetwork/hermes-client>, <https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes>

#### ❌ `PYTH-HERMES-RAW-ENDPOINT` — Raw keyless calls to hermes.pyth.network
_package.json_

Code calls the public Hermes REST/SSE endpoint directly (fetch/axios/curl) without an Authorization header or ACCESS_TOKEN. Keyless price-update requests now return HTTP 401.

- `src/raw-hermes.ts:4` — `"https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",`
- **Fix:** Send `Authorization: Bearer *** (REST) or `?ACCESS_TOKEN=***` (SSE/WebSocket), or use @pythnetwork/hermes-client >= 3.1.0 with `accessToken`.
- **Docs:** <https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes>

#### ❌ `SOLANA-REMOVED-RPC-METHODS` — Calls RPC methods removed from validators
_package.json_

web3.js 1.x still exposes helpers like getRecentBlockhash / getConfirmedTransaction / getFees, but Agave 2.x RPC nodes removed the underlying methods. They now fail with -32601 "Method not found" at runtime even though they type-check.

- `src/send.ts:7` — `const { blockhash } = await connection.getRecentBlockhash();`
- `src/send.ts:18` — `return connection.getConfirmedTransaction(sig);`
- **Fix:** Use getLatestBlockhash, getTransaction, getSignaturesForAddress, getBlock/getBlocks, getFeeForMessage instead.
- **Docs:** <https://solana.com/docs/rpc/deprecated>, <https://github.com/anza-xyz/agave/wiki/Agave-v2.0-Transition-Guide>

#### ❌ `PYTH-HERMES-KEYLESS-401` — Keyless Hermes Quickstart now returns HTTP 401
_packages/legacy-bot/package.json_

The hermes-client README Quickstart builds `new HermesClient("https://hermes.pyth.network", {})` with no credentials. The public endpoint now rejects keyless price-update requests (/v2/updates/price/latest) with `401 unauthorized`, so getLatestPriceUpdates() and SSE streams fail at runtime.

- `packages/legacy-bot/index.js:4` — `const hermes = new HermesClient("https://hermes.pyth.network", {});`
- **Fix:** Upgrade to @pythnetwork/hermes-client >= 3.1.0 and pass `{ accessToken: process.env.PYTH_HERMES_ACCESS_TOKEN }` (sent as `Authorization: Bearer *** or point the client at a provider-hosted Hermes endpoint.
- **Docs:** <https://www.npmjs.com/package/@pythnetwork/hermes-client>, <https://docs.pyth.network/price-feeds/api-instances-and-providers/hermes>

#### ⚠️ `ANCHOR-RENAMED-ANCHOR-LANG-CORE` — Renamed to @anchor-lang/core in Anchor 1.0
_package.json_

Anchor 1.0 (and 0.31.2+ release notes) moved the TypeScript client to @anchor-lang/core; the @coral-xyz/* line is legacy and is not the supported path for new releases.

- **Fix:** npm i @anchor-lang/core and replace imports from "@coral-xyz/anchor" (including dist/cjs/idl) with "@anchor-lang/core".
- **Docs:** <https://www.anchor-lang.com/docs/updates/release-notes/1-0-0>

#### ⚠️ `ONCHAIN-DEVNET-ON-MAINNET` — Known devnet-only address used in a mainnet context
_package.json_

Source hard-codes an address that is documented as devnet-only (e.g. Pyth's devnet oracle program), while the doctor is probing a mainnet RPC.

- `src/program.ts:13` — `export const PYTH_PROGRAM_ID = new PublicKey("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");`
- **Note:** gSbePebf… is documented for devnet; RPC provider is public-mainnet
- **Fix:** Switch to the mainnet program id, or select addresses from a cluster map keyed by the active RPC.
- **Docs:** <https://docs.pyth.network/price-feeds/core/contract-addresses/solana>

#### ⚠️ `SOLANA-CONFIRM-TX-STRING` — Deprecated confirmTransaction(signature)
_package.json_

Passing a bare signature string (instead of a { signature, blockhash, lastValidBlockHeight } strategy) relies on a fixed timeout instead of blockhash expiry, so confirmations randomly time out or report false failures under load.

- `src/send.ts:13` — `await connection.confirmTransaction(sig, "confirmed");`
- **Fix:** Call `connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, commitment)` using the values from getLatestBlockhash().
- **Docs:** <https://solana.com/developers/guides/advanced/confirmation>

#### ⚠️ `SOLANA-PUBLIC-RPC-HARDCODED` — Hard-coded public mainnet-beta RPC URL
_package.json_

api.mainnet-beta.solana.com is rate-limited and not intended for production apps; examples that hard-code it start returning 429s under real traffic.

- `src/send.ts:3` — `const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");`
- **Fix:** Read the RPC URL from configuration (e.g. process.env.SOLANA_RPC_URL) and use a dedicated RPC provider in production.
- **Docs:** <https://solana.com/docs/references/clusters>

#### ⚠️ `ANCHOR-PROJECT-SERUM-PACKAGE` — Abandoned package (last release 2022)
_packages/legacy-bot/package.json_

The Anchor TS client moved to @coral-xyz/anchor in 0.27, and to @anchor-lang/core in Anchor 1.0. The old package never gets fixes or IDL-format support.

- **Fix:** Replace with @anchor-lang/core (Anchor >= 1.0) or @coral-xyz/anchor (legacy 0.x) and update imports.
- **Docs:** <https://www.anchor-lang.com/docs/updates/changelog>

#### ⚠️ `PYTH-HERMES-NO-ACCESSTOKEN-OPTION` — No `accessToken` option before 3.1.0
_packages/legacy-bot/package.json_

The `accessToken` constructor option (Bearer auth for HTTP, ACCESS_TOKEN query param for SSE) first shipped in 3.1.0. Older versions can only authenticate by hand-rolling `headers: { Authorization }`, and SSE streams cannot be authenticated cleanly.

- **Fix:** npm i @pythnetwork/hermes-client@^3.1.0
- **Docs:** <https://www.npmjs.com/package/@pythnetwork/hermes-client?activeTab=versions>

#### ⚠️ `PYTH-PRICE-SERVICE-CLIENT-DEPRECATED` — Package is deprecated on npm
_packages/legacy-bot/package.json_

npm marks this package as deprecated and no longer maintained. Tutorials still reference it, but it will not receive the Hermes auth changes.

- **Fix:** Migrate to @pythnetwork/hermes-client >= 3.1.0 (and configure an accessToken).
- **Docs:** <https://www.npmjs.com/package/@pythnetwork/price-service-client>

#### ℹ️ `SOLANA-WEB3JS-V1-MAINTENANCE` — web3.js 1.x is in maintenance mode
_package.json_

New development happens in @solana/kit (formerly web3.js 2.0). 1.x still works but receives fixes only.

- **Fix:** Plan a migration to @solana/kit for new code; keep 1.x for libraries that still require it (e.g. Anchor clients).
- **Docs:** <https://github.com/anza-xyz/kit>, <https://www.npmjs.com/package/@solana/kit>

</details>

<sub>Generated by solana-sdk-doctor v0.1.0 at 2026-10-05T06:41:24.427Z</sub>
