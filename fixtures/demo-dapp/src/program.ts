import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

// Classic Anchor tutorial keypair — exists on mainnet as a system account but is NOT executable.
const programId = new anchor.web3.PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const provider = anchor.AnchorProvider.env();

// Pre-0.30 tutorial form: programId is now read from idl.address.
export const program = new anchor.Program(idl as anchor.Idl, programId, provider);

// Devnet-only Pyth oracle program — missing on mainnet.
export const PYTH_PROGRAM_ID = new PublicKey("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s");

// Deterministic dead account (sha256("solana-sdk-doctor-dead-account-v1")) — never existed on-chain.
export const DEAD_ACCOUNT = new PublicKey("61xbcX6texMRKS4qzDhbGEnjenYLJTHD8wXypY2BnaHz");
