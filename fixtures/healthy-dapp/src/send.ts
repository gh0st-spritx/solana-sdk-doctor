import { Connection, type Keypair, SystemProgram, Transaction } from "@solana/web3.js";

const connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");

// Migrated off connection.getRecentBlockhash() and confirmTransaction(sig) - both drifted (see solana-sdk-doctor).
export async function transfer(from: Keypair, to: Keypair, lamports: number) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: from.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to.publicKey, lamports }),
  );
  tx.sign(from);
  const signature = await connection.sendRawTransaction(tx.serialize());
  /* Strategy object, not a bare signature string: confirmation is bounded by blockhash expiry. */
  const strategy = { signature, blockhash, lastValidBlockHeight };
  await connection.confirmTransaction(strategy, "confirmed");
  return signature;
}
