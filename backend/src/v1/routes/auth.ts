import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage } from "viem";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { randomBytes } from "crypto";
import { pool } from "../../db/pool";
import { config } from "../../config";
import { getLinkedXAccountByWallet, isSolanaAddress, isEvmAddress } from "../services/x/xAccountService";
import { generatePkcePair, buildAuthorizeUrl } from "../services/x/oauth";
import { storePendingAuthState } from "../services/x/pendingAuthState";

const router = Router();

const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";

// Minimal scope: we only need to confirm identity (id + handle) once at link time,
// we don't post/read on the user's behalf, so no offline.access / write scopes.
const X_OAUTH_SCOPE = "users.read tweet.read";

export function issueJwt(walletAddress: string): string {
  return jwt.sign({ walletAddress }, config.jwtAccessSecret, { expiresIn: "7d" });
}

export async function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string,
): Promise<boolean> {
  try {
    if (isSolanaAddress(walletAddress)) {
      const pubkeyBytes = bs58.decode(walletAddress);
      // Support signature as base58, hex, or base64
      let sigBytes: Uint8Array;
      if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(signature)) {
        sigBytes = bs58.decode(signature);
      } else if (signature.startsWith("0x")) {
        sigBytes = Buffer.from(signature.slice(2), "hex");
      } else {
        sigBytes = Buffer.from(signature, "base64");
      }
      const messageBytes = new TextEncoder().encode(message);
      return nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
    } else if (isEvmAddress(walletAddress)) {
      return await verifyMessage({
        address: walletAddress as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    }
    return false;
  } catch {
    return false;
  }
}

router.post("/auth/signin", async (req, res, next) => {
  try {
    const { walletAddress, signature, message } = req.body as {
      walletAddress?: string;
      signature?: string;
      message?: string;
    };

    if (!walletAddress || !signature || !message) {
      res.status(400).json({ error: "walletAddress, signature, and message are required" });
      return;
    }

    const valid = await verifyWalletSignature(walletAddress, message, signature);

    if (!valid) {
      res.status(401).json({ error: "signature verification failed" });
      return;
    }

    const chainType = isSolanaAddress(walletAddress) ? "solana" : "robinhood";
    const normalizedWallet = isSolanaAddress(walletAddress) ? walletAddress : walletAddress.toLowerCase();

    await pool.query(
      `INSERT INTO users (wallet_address, chain_type) VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET chain_type = EXCLUDED.chain_type`,
      [normalizedWallet, chainType],
    );

    const linkedX = await getLinkedXAccountByWallet(normalizedWallet);
    if (linkedX) {
      const token = issueJwt(normalizedWallet);
      res.json({ token, xLinked: true, xHandle: linkedX.xHandle });
      return;
    }

    // Wallet ownership is verified, but auth is two-step: no JWT until an X account
    // is linked too. Hand back an authorize URL for the frontend to redirect to.
    const state = randomBytes(16).toString("hex");
    const { codeVerifier, codeChallenge } = generatePkcePair();
    await storePendingAuthState(state, { walletAddress: normalizedWallet, codeVerifier });

    res.json({
      needsXLink: true,
      authorizeUrl: buildAuthorizeUrl({ state, codeChallenge, scope: X_OAUTH_SCOPE }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
