import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, TransactionMessage, AddressLookupTableAccount } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import path from "path";
import fs from "fs";
import { CockpitWallet } from "./generateWallets";

const WALLETS_FILE = path.join(__dirname, "wallets.json");

export function loadCockpitWallets(): { [name: string]: { wallet: CockpitWallet; keypair: Keypair } } {
  if (!fs.existsSync(WALLETS_FILE)) {
    throw new Error("wallets.json does not exist. Run generateWallets.ts first.");
  }
  const raw: CockpitWallet[] = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  const map: { [name: string]: { wallet: CockpitWallet; keypair: Keypair } } = {};
  for (const w of raw) {
    const keypair = Keypair.fromSecretKey(bs58.decode(w.secretKey));
    map[w.name.toLowerCase()] = { wallet: w, keypair };
  }
  return map;
}

export const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
export const connection = new Connection(SOLANA_RPC, "confirmed");
export const API_BASE = process.env.API_BASE_URL || "https://api.tagiopay.com";

export async function getSolBalance(publicKey: PublicKey): Promise<number> {
  try {
    const lamports = await connection.getBalance(publicKey);
    return lamports / 1e9;
  } catch {
    return 0;
  }
}

export async function authenticateWallet(keypair: Keypair): Promise<{ token: string; xHandle?: string }> {
  const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";
  const messageBytes = new TextEncoder().encode(SIGNIN_MESSAGE);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signature = bs58.encode(signatureBytes);

  const res = await fetch(`${API_BASE}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: keypair.publicKey.toBase58(),
      signature,
      message: SIGNIN_MESSAGE,
    }),
  });

  const data = await res.json();
  if (!res.ok && !data.needsXLink) {
    throw new Error(`Auth failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return { token: data.token || "dev_jwt_placeholder", xHandle: data.xHandle };
}

export async function sendNativeSol(sender: Keypair, recipient: PublicKey, amountSol: number): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: sender.publicKey,
      toPubkey: recipient,
      lamports: Math.round(amountSol * 1e9),
    })
  );
  const sig = await connection.sendTransaction(tx, [sender]);
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
