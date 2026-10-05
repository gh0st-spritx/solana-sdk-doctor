<!-- solana-sdk-doctor-report -->
### 🩺 Solana SDK Doctor — ❌ SDK drift detected

**9** fail · **2** warn · **1** info · **0** pass — live mode, 16 rules, 1 package.json

RPC: provider `public-mainnet` · `https://api.mainnet-beta.solana.com` · slot **453501262** · latency **339ms** · on-chain addrs **12**

| | Rule | Package | Finding | Evidence |
|---|---|---|---|---|
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: 8tfDNiaEyrV6Q1U4DEXrEigs9DoDtkugzFbybENEbCDz → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2 → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: AGQnwBFJ3WwWXqjkaeDKYkU3tJFi8cMkCCevQeLUYSf5 → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: 4Lqbt4kQYjc5TxQiyRiLKi9rvizU4VRiXUpzEBkZLbid → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: 9TvBred1G7eFo8E16MEK4LxHP11XEMqxkdmZ84WtaUau → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: 7VJsBtJzgTftYzEeooSDYyjKXvYRWJHdwvbwfBvTg9K → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: FPPnzp74SGt72T463B62fQh3Di9fXrBe82YnQh8ycQp9 → null (missing/closed) |
| ❌ | `ONCHAIN-ACCOUNT-MISSING` | _source_ | Hard-coded account missing or closed on-chain | live: GBvYgUMCt4nvycUZMEBpHyLEXGbKjr6G9HjMjmLyf6mA → null (missing/closed) |
| ⚠️ | `ANCHOR-RENAMED-ANCHOR-LANG-CORE` | `@coral-xyz/anchor@0.29.0` | Renamed to @anchor-lang/core in Anchor 1.0 | live: @anchor-lang/core@1.2.0 is published |
| ⚠️ | `ONCHAIN-DEVNET-ON-MAINNET` | _source_ | Known devnet-only address used in a mainnet context | live: gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s flagged as devnet-only while probing public-mainnet |
| ℹ️ | `SOLANA-WEB3JS-V1-MAINTENANCE` | `@solana/web3.js@1.72.0` | web3.js 1.x is in maintenance mode | live: @solana/kit@8.4.0 is published |

<details><summary>Details & fixes</summary>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/cluster.ts:8` — `devnet: 'gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s',`
- **Note:** gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/cluster.ts:10` — `testnet: '8tfDNiaEyrV6Q1U4DEXrEigs9DoDtkugzFbybENEbCDz',`
- **Note:** 8tfDNiaEyrV6Q1U4DEXrEigs9DoDtkugzFbybENEbCDz → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/Example.test.ts:5` — `const ORACLE_MAPPING_PUBLIC_KEY = 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2'`
- `src/__tests__/Mapping.test.ts:7` — `const oraclePublicKey = 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2'`
- `src/__tests__/Price.test.ts:16` — `const oraclePublicKey = 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2'`
- `src/__tests__/Product.test.ts:8` — `const oraclePublicKey = 'BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2'`
- **Note:** BmA9Z6FjioHJPpjT39QazZyhDRUdZy2ezwx4GiDdE2u2 → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/Permission.test.ts:16` — `expect(permission.masterAuthority.equals(new PublicKey('AGQnwBFJ3WwWXqjkaeDKYkU3tJFi8cMkCCevQeLUYSf5'))).toBeTruthy()`
- **Note:** AGQnwBFJ3WwWXqjkaeDKYkU3tJFi8cMkCCevQeLUYSf5 → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/Permission.test.ts:18` — `permission.dataCurationAuthority.equals(new PublicKey('4Lqbt4kQYjc5TxQiyRiLKi9rvizU4VRiXUpzEBkZLbid')),`
- **Note:** 4Lqbt4kQYjc5TxQiyRiLKi9rvizU4VRiXUpzEBkZLbid → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/Permission.test.ts:21` — `permission.securityAuthority.equals(new PublicKey('9TvBred1G7eFo8E16MEK4LxHP11XEMqxkdmZ84WtaUau')),`
- **Note:** 9TvBred1G7eFo8E16MEK4LxHP11XEMqxkdmZ84WtaUau → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/PythNetworkRestClient.test.ts:31` — `const solUSDKey = new PublicKey('7VJsBtJzgTftYzEeooSDYyjKXvYRWJHdwvbwfBvTg9K')`
- `src/__tests__/PythNetworkRestClient.test.ts:64` — `const solUSDKey = new PublicKey('7VJsBtJzgTftYzEeooSDYyjKXvYRWJHdwvbwfBvTg9K')`
- `src/__tests__/PythNetworkRestClient.test.ts:103` — `const solUSDKey = new PublicKey('7VJsBtJzgTftYzEeooSDYyjKXvYRWJHdwvbwfBvTg9K')`
- **Note:** 7VJsBtJzgTftYzEeooSDYyjKXvYRWJHdwvbwfBvTg9K → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/PythNetworkRestClient.test.ts:65` — `const bonkUSDKey = new PublicKey('FPPnzp74SGt72T463B62fQh3Di9fXrBe82YnQh8ycQp9')`
- **Note:** FPPnzp74SGt72T463B62fQh3Di9fXrBe82YnQh8ycQp9 → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ❌ `ONCHAIN-ACCOUNT-MISSING` — Hard-coded account missing or closed on-chain
_package.json_

A base58 pubkey hard-coded in source was not found via getMultipleAccounts on the configured cluster (null account). The address is closed, never existed, or belongs to a different cluster.

- `src/__tests__/PythNetworkRestClient.test.ts:66` — `const usdcUSDKey = new PublicKey('GBvYgUMCt4nvycUZMEBpHyLEXGbKjr6G9HjMjmLyf6mA')`
- `src/__tests__/PythNetworkRestClient.test.ts:106` — `const usdcUSDKey = new PublicKey('GBvYgUMCt4nvycUZMEBpHyLEXGbKjr6G9HjMjmLyf6mA')`
- **Note:** GBvYgUMCt4nvycUZMEBpHyLEXGbKjr6G9HjMjmLyf6mA → null on public-mainnet
- **Fix:** Replace the address with the current mainnet pubkey, or gate cluster-specific addresses behind an env/config switch.
- **Docs:** <https://solana.com/docs/rpc/http/getmultipleaccounts>

#### ⚠️ `ANCHOR-RENAMED-ANCHOR-LANG-CORE` — Renamed to @anchor-lang/core in Anchor 1.0
_package.json_

Anchor 1.0 (and 0.31.2+ release notes) moved the TypeScript client to @anchor-lang/core; the @coral-xyz/* line is legacy and is not the supported path for new releases.

- **Fix:** npm i @anchor-lang/core and replace imports from "@coral-xyz/anchor" (including dist/cjs/idl) with "@anchor-lang/core".
- **Docs:** <https://www.anchor-lang.com/docs/updates/release-notes/1-0-0>

#### ⚠️ `ONCHAIN-DEVNET-ON-MAINNET` — Known devnet-only address used in a mainnet context
_package.json_

Source hard-codes an address that is documented as devnet-only (e.g. Pyth's devnet oracle program), while the doctor is probing a mainnet RPC.

- `src/cluster.ts:8` — `devnet: 'gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s',`
- **Note:** gSbePebf… is documented for devnet; RPC provider is public-mainnet
- **Fix:** Switch to the mainnet program id, or select addresses from a cluster map keyed by the active RPC.
- **Docs:** <https://docs.pyth.network/price-feeds/core/contract-addresses/solana>

#### ℹ️ `SOLANA-WEB3JS-V1-MAINTENANCE` — web3.js 1.x is in maintenance mode
_package.json_

New development happens in @solana/kit (formerly web3.js 2.0). 1.x still works but receives fixes only.

- **Fix:** Plan a migration to @solana/kit for new code; keep 1.x for libraries that still require it (e.g. Anchor clients).
- **Docs:** <https://github.com/anza-xyz/kit>, <https://www.npmjs.com/package/@solana/kit>

</details>

<sub>Generated by solana-sdk-doctor v0.1.0 at 2026-10-05T06:41:26.106Z</sub>
