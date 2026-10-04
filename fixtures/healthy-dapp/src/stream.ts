import { HermesClient } from "@pythnetwork/hermes-client";

// Options built once and shared: the doctor resolves `hermesOptions` back to its declaration.
const hermesOptions = { accessToken: process.env.PYTH_HERMES_ACCESS_TOKEN, timeout: 10_000 };

export const streamClient = new HermesClient(process.env.HERMES_URL ?? "https://hermes.pyth.network", hermesOptions);
