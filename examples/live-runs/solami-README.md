# Live runs via Solami (mainnet)

Captured 2026-10-06 with `--rpc solami` (`https://rpc.solami.dev/sol?api_key=***`; the key is redacted by the doctor in every output format).

| File | Target | Header (provider · slot · latency · on-chain addrs) | Exit |
|---|---|---|---|
| `solami-demo-dapp.txt` / `.json` | `fixtures/demo-dapp` | solami · slot 453907452 · 165ms · 3 | 1 |
| `solami-pyth-examples.txt` | [pyth-network/pyth-examples](https://github.com/pyth-network/pyth-examples) @ `24e23da` (2026-10-01) | solami · slot 453907458 · 319ms · 5 | 1 |
| `solami-healthy-dapp.txt` | `fixtures/healthy-dapp` | solami · slot 453907464 · 322ms · 2 | 0 |

What Solami answered (all live, mainnet):

- **demo-dapp**: `getMultipleAccounts` returns `null` for Pyth's devnet oracle program `gSbePeb…` and the dead account `61xbcX6…`
  (ONCHAIN-ACCOUNT-MISSING). The Anchor tutorial id `Fg6PaFp…` exists but `executable=false` (ONCHAIN-PROGRAM-NOT-EXECUTABLE).
  `gSbePeb…` is also flagged as a known devnet address (ONCHAIN-DEVNET-ON-MAINNET).
  `getRecentBlockhash` → `-32600 "Invalid Request: unsupported method"` (SOLANA-REMOVED-RPC-METHODS, live).
- **pyth-examples**: two program ids are absent on mainnet: `HU64YGK…` (`lazer/js/src/solana/post_solana.ts:21`) and
  `2e5gZD3…` (`price_feeds/solana/send_usd/app/src/App.tsx:31`, `declare_id!` in `program/src/lib.rs`).
  We checked both by hand. They are **devnet deployments**: each is an executable BPF-upgradeable program on devnet, the source
  comments say "on devnet", and both examples connect to `api.devnet.solana.com`. So the examples work on devnet as written.
  Porting them to mainnet as-is would fail. The Pyth Lazer contract addresses in the same file (`pytd2yy…`, its storage
  and treasury accounts) resolve on mainnet.
- **healthy-dapp**: Token program + Pyth receiver resolve on mainnet; 0 fail / 0 warn.

Note: Solami reports removed methods as `-32600 … unsupported method` instead of public mainnet-beta's `-32601 Method not found`.
The probe matches both (see `driftWhen.rpcErrorMessage` in `src/rules/builtin.json`).
