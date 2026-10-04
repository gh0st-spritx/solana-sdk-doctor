import { HermesClient } from "@pythnetwork/hermes-client";

// Not the README Quickstart (`new HermesClient("https://hermes.pyth.network", {})`): keyless calls now 401.
const connection = new HermesClient(process.env.HERMES_URL ?? "https://hermes.pyth.network", {
  accessToken: process.env.PYTH_HERMES_ACCESS_TOKEN,
});

export const latest = (ids: string[]) => connection.getLatestPriceUpdates(ids);
