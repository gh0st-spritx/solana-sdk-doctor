import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

export async function transfer(from: Keypair, to: Keypair, lamports: number) {
  // Tutorial-era call: the RPC method behind this was removed from Agave 2.x validators.
  const { blockhash } = await connection.getRecentBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: from.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to.publicKey, lamports }),
  );
  tx.sign(from);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function lookup(sig: string) {
  return connection.getConfirmedTransaction(sig);
}
