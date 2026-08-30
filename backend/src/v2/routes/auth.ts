import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage, isAddress } from "viem";
import { randomBytes } from "crypto";
import { pool } from "../../db/pool";
import { config } from "../../config";
import { generatePkcePair, buildAuthorizeUrl } from "../../v1/services/x/oauth";
import { storePendingAuthState } from "../../v1/services/x/pendingAuthState";

const router = Router();

const SIGNIN_MESSAGE_V2 = "Welcome to TagioFi! Please sign this message to verify your wallet ownership.";
const X_OAUTH_SCOPE = "users.read tweet.read";

export function issueV2Jwt(walletAddress: string): string {
  return jwt.sign({ walletAddress: walletAddress.toLowerCase(), version: "v2" }, config.jwtAccessSecret, {
    expiresIn: "7d",
  });
}

// POST /v2/auth/signin — Sign in with Robinhood EVM wallet
router.post("/v2/auth/signin", async (req, res, next) => {
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

    if (!isAddress(walletAddress)) {
      res.status(400).json({ error: "walletAddress must be a valid EVM address" });
      return;
    }

    const valid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    const normalizedWallet = walletAddress.toLowerCase();

    // Check if user already has a v2 handle or linked X account
    const { rows } = await pool.query(
      "SELECT handle, x_user_id, x_handle FROM v2_handles WHERE LOWER(owner_wallet) = $1 LIMIT 1",
      [normalizedWallet]
    );

    if (rows.length > 0 && rows[0].x_user_id) {
      const token = issueV2Jwt(normalizedWallet);
      res.json({
        token,
        xLinked: true,
        xHandle: rows[0].x_handle,
        handle: rows[0].handle,
      });
      return;
    }

    // Step 2: X Linking required
    const state = `v2_${randomBytes(16).toString("hex")}`;
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
