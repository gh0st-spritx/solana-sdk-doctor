import { HermesClient } from "@pythnetwork/hermes-client";

// Copied verbatim from the @pythnetwork/hermes-client README "Quickstart".
const connection = new HermesClient("https://hermes.pyth.network", {});

const priceIds = [
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD
];

export async function latestPrices() {
  // Works: /v2/price_feeds is still keyless.
  const feeds = await connection.getPriceFeeds({ query: "btc", assetType: "crypto" });
  // Breaks: /v2/updates/price/latest now returns 401 without an access token.
  const updates = await connection.getLatestPriceUpdates(priceIds);
  return { feeds, updates };
}
