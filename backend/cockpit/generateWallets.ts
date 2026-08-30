import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "path";

export interface CockpitWallet {
  name: string;
  role: string;
  publicKey: string;
  secretKey: string; // base58
}

const WALLETS_FILE = path.join(__dirname, "wallets.json");
const ENV_FILE = path.join(__dirname, ".env");

const WALLET_DEFS = [
  { name: "Alice", role: "Creator & Hashtag Owner" },
  { name: "Bob", role: "Sender & Stock Buyer" },
  { name: "Charlie", role: "Freelancer & Split Partner" },
  { name: "Dave", role: "Cause Donor & Airdrop Winner" },
];

export function getOrCreateWallets(): CockpitWallet[] {
  if (fs.existsSync(WALLETS_FILE)) {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  }

  const wallets: CockpitWallet[] = WALLET_DEFS.map((def) => {
    const kp = Keypair.generate();
    return {
      name: def.name,
      role: def.role,
      publicKey: kp.publicKey.toBase58(),
      secretKey: bs58.encode(kp.secretKey),
    };
  });

  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");

  // Write cockpit .env
  const envContent = [
    `# Cockpit Test Wallets Generated at ${new Date().toISOString()}`,
    ...wallets.map((w) => `WALLET_${w.name.toUpperCase()}_PUBKEY=${w.publicKey}\nWALLET_${w.name.toUpperCase()}_SECRET=${w.secretKey}`),
    `\nSOLANA_RPC_URL=https://api.mainnet-beta.solana.com`,
    `API_BASE_URL=http://localhost:3001`,
  ].join("\n");

  fs.writeFileSync(ENV_FILE, envContent, "utf8");
  console.log(`\nGenerated 4 Cockpit Test Wallets saved to: ${WALLETS_FILE} & ${ENV_FILE}`);
  return wallets;
}

if (import.meta.main) {
  const wallets = getOrCreateWallets();
  console.log("\n==================================================");
  console.log("             TAGIOPAY COCKPIT TEST WALLETS        ");
  console.log("==================================================");
  wallets.forEach((w, i) => {
    console.log(`\n${i + 1}. [${w.name}] — ${w.role}`);
    console.log(`   Public Address: ${w.publicKey}`);
    console.log(`   Base58 Secret:  ${w.secretKey.slice(0, 10)}...${w.secretKey.slice(-6)}`);
  });
  console.log("\n==================================================");
}
