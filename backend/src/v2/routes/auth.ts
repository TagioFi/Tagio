import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage, isAddress } from "viem";
import { randomBytes } from "crypto";
import { pool } from "../../db/pool";
import { config } from "../../config";
import { generatePkcePair, buildAuthorizeUrl } from "../services/oauth";
import { storePendingV2AuthState } from "../services/pendingAuthState";

const router = Router();

const X_OAUTH_SCOPE = "users.read tweet.read";

export interface V2JwtPayload {
  walletAddress: string;
  xUserId?: string | null;
  xHandle?: string | null;
  version: "v2";
}

export function issueV2Jwt(walletAddress: string, xUserId?: string | null, xHandle?: string | null): string {
  const payload: V2JwtPayload = {
    walletAddress: walletAddress.toLowerCase(),
    xUserId: xUserId || null,
    xHandle: xHandle || null,
    version: "v2",
  };
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: "7d" });
}

// POST /v2/auth/signin — Sign in with Robinhood EVM wallet
router.post("/v2/auth/signin", async (req, res, next) => {
  try {
    const { walletAddress, signature, message, relink } = req.body as {
      walletAddress?: string;
      signature?: string;
      message?: string;
      relink?: boolean;
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

    // Check wallet identity in v2_wallet_identities
    const identityRes = await pool.query(
      "SELECT wallet_address, x_user_id, x_handle FROM v2_wallet_identities WHERE LOWER(wallet_address) = $1 LIMIT 1",
      [normalizedWallet]
    );

    // If wallet already has a verified X account and relink is not requested
    if (identityRes.rows.length > 0 && !relink) {
      const row = identityRes.rows[0];
      const token = issueV2Jwt(normalizedWallet, row.x_user_id, row.x_handle);
      res.json({
        token,
        needsXLink: false,
        xLinked: true,
        user: {
          walletAddress: normalizedWallet,
          xUserId: row.x_user_id,
          xHandle: row.x_handle,
        },
      });
      return;
    }

    // Step 2: X Linking required (or relinking)
    const state = `v2_${randomBytes(16).toString("hex")}`;
    const { codeVerifier, codeChallenge } = generatePkcePair();
    await storePendingV2AuthState(state, { walletAddress: normalizedWallet, codeVerifier });

    res.json({
      needsXLink: true,
      xLinked: false,
      state,
      authorizeUrl: buildAuthorizeUrl({ state, codeChallenge, scope: X_OAUTH_SCOPE }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /v2/auth/me — Session check endpoint
router.get("/v2/auth/me", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ authenticated: false, error: "Missing Bearer token" });
      return;
    }

    let payload: V2JwtPayload;
    try {
      payload = jwt.verify(authHeader.slice(7), config.jwtAccessSecret) as V2JwtPayload;
    } catch {
      res.status(401).json({ authenticated: false, error: "Invalid or expired token" });
      return;
    }

    const normalizedWallet = payload.walletAddress.toLowerCase();

    // Query fresh identity and owned tags
    const [identityRes, handlesRes] = await Promise.all([
      pool.query(
        "SELECT x_user_id, x_handle FROM v2_wallet_identities WHERE LOWER(wallet_address) = $1 LIMIT 1",
        [normalizedWallet]
      ),
      pool.query(
        "SELECT handle, display_name FROM v2_handles WHERE LOWER(owner_wallet) = $1 ORDER BY created_at ASC",
        [normalizedWallet]
      ),
    ]);

    const identity = identityRes.rows[0] || null;
    const isLinked = Boolean(identity?.x_user_id);

    res.json({
      authenticated: true,
      walletAddress: normalizedWallet,
      xUserId: identity?.x_user_id || payload.xUserId || null,
      xHandle: identity?.x_handle || payload.xHandle || null,
      isLinked,
      handles: handlesRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
