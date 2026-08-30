import { Router } from "express";
import { config } from "../../config";
import { consumePendingAuthState } from "../services/x/pendingAuthState";
import { exchangeCodeForToken, getAuthenticatedXUser } from "../services/x/oauth";
import { linkXAccount } from "../services/x/xAccountService";
import { claimAllocationsForXUser } from "../services/x/unclaimedAllocationService";
import { issueJwt } from "./auth";

const router = Router();

router.get("/auth/x/callback", async (req, res, next) => {
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

    const pending = await consumePendingAuthState(state);
    if (!pending) {
      res.redirect(`${config.frontendUrl}/auth/callback?error=expired_or_invalid_state`);
      return;
    }

    const tokenResponse = await exchangeCodeForToken(code, pending.codeVerifier);
    const xUser = await getAuthenticatedXUser(tokenResponse.access_token);

    await linkXAccount(pending.walletAddress, xUser.id, xUser.username);
    await claimAllocationsForXUser(xUser.id, pending.walletAddress as `0x${string}`);

    const token = issueJwt(pending.walletAddress);
    // Fragment, not query string -- the JWT never gets logged in server access logs.
    res.redirect(`${config.frontendUrl}/auth/callback#token=${token}`);
  } catch (err) {
    next(err);
  }
});

export default router;
