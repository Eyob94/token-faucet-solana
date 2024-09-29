import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { assert } from "chai";
import { TokenFaucet } from "../target/types/token_faucet";

describe("token-faucet", () => {
  const provider = anchor.AnchorProvider.local();
  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenFaucet as Program<TokenFaucet>;

  const payer = provider.wallet;
  const state = Keypair.generate();
  const recipient = Keypair.generate();

  const [authority, _authorityBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet")],
    program.programId
  );

  const [mintPDA, _mintBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("faucet_mint")],
    program.programId
  );

  it("Is initialized!", async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

    const tx = await program.methods
      .initialize()
      .accounts({
        state: state.publicKey,
        mint: mintPDA,
        authority,
        payer: payer.publicKey,
        system_program: SystemProgram.programId,
        token_program: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([state])
      .rpc();

    const stateAccount = await program.account.state.fetch(state.publicKey);
    assert.isTrue(stateAccount.isInitialized, "Faucet should be initialized");
    assert.equal(
      stateAccount.mint.toBase58(),
      mintPDA.toBase58(),
      "Faucet should be initialized"
    );
    assert.equal(stateAccount.bump, _authorityBump, "Bump mismatch");

    console.log("Transaction signature", tx);
  });

  it("dispenses tokens!", async () => {
    const recipientTokenAccount = await getAssociatedTokenAddress(
      mintPDA,
      recipient.publicKey
    );

    const createATA = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        recipientTokenAccount,
        recipient.publicKey,
        mintPDA
      )
    );
    const airdropSignature = await provider.connection.requestAirdrop(
      payer.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);
    await provider.sendAndConfirm(createATA, []);

    const dispenseAmount = 1000 * 10 ** 9;

    const tx = await program.methods
      .dispense(new anchor.BN(dispenseAmount))
      .accounts({
        state: state.publicKey,
        mint: mintPDA,
        authority,
        to: recipientTokenAccount,
        token_program: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const tokenAccount = await program.provider.connection.getParsedAccountInfo(
      recipientTokenAccount
    );
    if (tokenAccount.value === null) {
      throw new Error("Token account not found");
    }
    const parsedData = tokenAccount.value.data as any;
    const amount = parsedData.parsed.info.tokenAmount.amount;
    assert.equal(
      amount,
      dispenseAmount.toString(),
      "Dispensed amount mismatch"
    );
  });
});
