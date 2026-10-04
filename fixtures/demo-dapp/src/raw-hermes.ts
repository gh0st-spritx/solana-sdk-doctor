// A "no SDK" variant many bots use.
export async function btcPriceRaw() {
  const res = await fetch(
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  );
  if (!res.ok) throw new Error(`hermes ${res.status}`);
  return res.json();
}
