import { Router } from "express";
import { config } from "../../config";
import { pool } from "../../db/pool";
import { consumePendingV2AuthState } from "../services/pendingAuthState";
import { exchangeCodeForToken, getAuthenticatedXUser } from "../services/oauth";
import { issueV2Jwt } from "./auth";

const router = Router();

// GET /v2/auth/x/callback — OAuth 2.0 PKCE callback specifically for v2
router.get("/v2/auth/x/callback", async (req, res, next) => {
  try {
    const { code, state, error: xError } = req.query as { code?: string; state?: string; error?: string };

    if (xError) {
      res.redirect(`${config.frontendUrl}/auth/callback?error=${encodeURIComponent(xError)}`);
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const pending = await consumePendingV2AuthState(state);
    if (!pending) {
      res.redirect(`${config.frontendUrl}/auth/callback?error=expired_or_invalid_state`);
      return;
    }

    const tokenResponse = await exchangeCodeForToken(code, pending.codeVerifier);
    const xUser = await getAuthenticatedXUser(tokenResponse.access_token);
    const normalizedWallet = pending.walletAddress.toLowerCase();

    // 1. Persist wallet-level identity in v2_wallet_identities
    await pool.query(
      `INSERT INTO v2_wallet_identities (wallet_address, x_user_id, x_handle, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (wallet_address) DO UPDATE SET
         x_user_id = EXCLUDED.x_user_id,
         x_handle = EXCLUDED.x_handle,
         updated_at = NOW()`,
      [normalizedWallet, xUser.id, xUser.username]
    );

    // 2. Backfill any existing v2_handles owned by this wallet with the verified X identity
    await pool.query(
      `UPDATE v2_handles 
       SET x_user_id = $1, x_handle = $2, updated_at = NOW() 
       WHERE LOWER(owner_wallet) = $3`,
      [xUser.id, xUser.username, normalizedWallet]
    );

    // 3. Issue JWT carrying verified X identity
    const token = issueV2Jwt(normalizedWallet, xUser.id, xUser.username);
    res.redirect(
      `${config.frontendUrl}/auth/callback#token=${token}&xHandle=${encodeURIComponent(xUser.username)}&walletAddress=${normalizedWallet}`
    );
  } catch (err) {
    next(err);
  }
});

export default router;
