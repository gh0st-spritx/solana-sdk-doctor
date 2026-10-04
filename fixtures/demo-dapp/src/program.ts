import * as anchor from "@coral-xyz/anchor";
import idl from "./idl.json";

const programId = new anchor.web3.PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const provider = anchor.AnchorProvider.env();

// Pre-0.30 tutorial form: programId is now read from idl.address.
export const program = new anchor.Program(idl as anchor.Idl, programId, provider);
