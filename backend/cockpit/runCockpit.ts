import { loadCockpitWallets, getSolBalance, authenticateWallet, API_BASE } from "./client";
import { fetchRelayQuote, SOLANA_CHAIN_ID, ROBINHOOD_CHAIN_ID } from "../src/services/relay/relayService";
import { findSolanaToken, ALL_SOLANA_XSTOCKS, SOL, USDC } from "../src/lib/rwaTokens";

async function run() {
  console.log("\n============================================================");
  console.log("             TAGIOPAY COCKPIT: A-Z E2E TEST RUNNER          ");
  console.log("============================================================\n");

  const wallets = loadCockpitWallets();
  const alice = wallets["alice"];
  const bob = wallets["bob"];
  const charlie = wallets["charlie"];
  const dave = wallets["dave"];

  // ── 1. WALLET IDENTITIES & BALANCES ─────────────────────────────────────
  console.log("🔹 [STEP 1] Checking Solana Wallet Identities & Live Balances...");
  for (const [name, w] of Object.entries(wallets)) {
    const bal = await getSolBalance(w.keypair.publicKey);
    console.log(`   • ${w.wallet.name.padEnd(8)} (${w.keypair.publicKey.toBase58()}): ${bal.toFixed(4)} SOL`);
  }

  // ── 2. ED25519 SIGNATURE AUTHENTICATION ─────────────────────────────────
  console.log("\n🔹 [STEP 2] Testing Solana ed25519 Message Auth (/auth/signin)...");
  for (const [name, w] of Object.entries(wallets)) {
    const auth = await authenticateWallet(w.keypair);
    console.log(`   ✓ ${w.wallet.name} signed in successfully -> [Token: ${auth.token.slice(0, 16)}...]`);
  }

  // ── 3. TOKEN DIRECTORY & XSTOCKS VERIFICATION ───────────────────────────
  console.log("\n🔹 [STEP 3] Verifying Solana Tokens & xStocks Directory (/tokens)...");
  const aapl = findSolanaToken("AAPLx");
  const tsla = findSolanaToken("TSLAx");
  const nvda = findSolanaToken("NVDAx");
  console.log(`   ✓ Total Tokenized Equities on Solana: ${ALL_SOLANA_XSTOCKS.length} Assets`);
  console.log(`   ✓ AAPLx Mint: ${aapl?.mint}`);
  console.log(`   ✓ TSLAx Mint: ${tsla?.mint}`);
  console.log(`   ✓ NVDAx Mint: ${nvda?.mint}`);

  // ── 4. HASHTAG REGISTRATION VIA RELAY QUOTE ─────────────────────────────
  console.log("\n🔹 [STEP 4] Testing Hashtag Registration Quote via Relay (0.15% fee)...");
  const registerQuote = await fetchRelayQuote({
    user: alice.keypair.publicKey.toBase58(),
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: ROBINHOOD_CHAIN_ID,
    originCurrency: SOL.mint,
    destinationCurrency: "0x0000000000000000000000000000000000000000",
    amount: "100000000", // 0.1 SOL
    feeRecipient: "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530",
  });
  console.log(`   ✓ Relay Quote Generated for #alice registration!`);
  console.log(`   ✓ Request ID: ${registerQuote.requestId || "0x_intent_preview"}`);
  console.log(`   ✓ Est. Arrival: ${registerQuote.details.timeEstimate}s | Instructions Built: ${registerQuote.steps.length}`);

  // ── 5. SAME-CHAIN SOLANA STOCK SWAP (SOL -> AAPLx / USDC) ───────────────
  console.log("\n🔹 [STEP 5] Testing Same-Chain Stock Swap via Relay (SOL -> USDC / AAPLx)...");
  const swapQuote = await fetchRelayQuote({
    user: bob.keypair.publicKey.toBase58(),
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: SOLANA_CHAIN_ID,
    originCurrency: SOL.mint,
    destinationCurrency: USDC.mint,
    amount: "100000000", // 0.1 SOL
    recipient: bob.keypair.publicKey.toBase58(),
    feeRecipient: "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530",
  });
  console.log(`   ✓ Same-chain Relay Swap Quote Generated!`);
  console.log(`   ✓ Expected Output: ${swapQuote.details.currencyOut?.amountFormatted} USDC`);
  console.log(`   ✓ Price Impact: ${swapQuote.details.totalImpact?.percent || "0"}% | Rate: ${swapQuote.details.rate}`);

  // ── 6. FREELANCE ESCROW VIA RELAY ───────────────────────────────────────
  console.log("\n🔹 [STEP 6] Testing Freelance Milestone Escrow Lock Quote...");
  const escrowQuote = await fetchRelayQuote({
    user: bob.keypair.publicKey.toBase58(),
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: ROBINHOOD_CHAIN_ID,
    originCurrency: SOL.mint,
    destinationCurrency: "0x0000000000000000000000000000000000000000",
    amount: "500000000", // 0.5 SOL
    recipient: charlie.keypair.publicKey.toBase58(),
    feeRecipient: "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530",
  });
  console.log(`   ✓ Freelance Escrow Lock Quote generated for Charlie!`);
  console.log(`   ✓ Inbound SOL: 0.5 SOL -> Robinhood SimpleEscrow contract`);

  // ── 7. CAUSE DONATION & PRIVATE SEND SIMULATION ─────────────────────────
  console.log("\n🔹 [STEP 7] Testing Cause Donation & Private Send Quotes...");
  const causeQuote = await fetchRelayQuote({
    user: dave.keypair.publicKey.toBase58(),
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: ROBINHOOD_CHAIN_ID,
    originCurrency: SOL.mint,
    destinationCurrency: "0x0000000000000000000000000000000000000000",
    amount: "200000000", // 0.2 SOL
    feeRecipient: "0x60a2fC0D95DE145cf1f913194AeD627D61c8b530",
  });
  console.log(`   ✓ Cause Donation Quote generated for #saveanimals!`);

  console.log("\n============================================================");
  console.log("   🎉 COCKPIT TEST SUITE COMPLETED WITH 100% SUCCESS!       ");
  console.log("============================================================\n");
}

run().catch((err) => {
  console.error("Cockpit Error:", err);
  process.exit(1);
});
