const { HermesClient } = require("@pythnetwork/hermes-client");
const { PriceServiceConnection } = require("@pythnetwork/price-service-client");

const hermes = new HermesClient("https://hermes.pyth.network", {});
const legacy = new PriceServiceConnection("https://hermes.pyth.network");

module.exports = { hermes, legacy };
