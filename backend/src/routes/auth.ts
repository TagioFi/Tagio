import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage } from "viem";
import { randomBytes } from "crypto";
import { pool } from "../db/pool";
import { config } from "../config";
import { getLinkedXAccountByWallet } from "../services/x/xAccountService";
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

router.post("/auth/signin", async (req, res, next) => {
  try {
    const { walletAddress, signature, message } = req.body as {
      walletAddress?: `0x${string}`;
      signature?: `0x${string}`;
      message?: string;
    };

    if (!walletAddress || !signature || !message) {
      res.status(400).json({ error: "walletAddress, signature, and message are required" });
      return;
    }

    const valid = await verifyMessage({
      address: walletAddress,
      message,
      signature,
    });

    if (!valid) {
      res.status(401).json({ error: "signature verification failed" });
      return;
    }

    const normalizedWallet = walletAddress.toLowerCase();

    await pool.query(
      `INSERT INTO users (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [normalizedWallet],
    );

    const linkedX = await getLinkedXAccountByWallet(normalizedWallet);
    if (linkedX) {
      const token = issueJwt(walletAddress);
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
