# demo-dapp

Fetch BTC/USD from Pyth (copied from the hermes-client Quickstart):

```ts
const connection = new HermesClient("https://hermes.pyth.network", {});
const priceUpdates = await connection.getLatestPriceUpdates(priceIds);
```
