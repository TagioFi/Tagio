import { Router } from "express";
import { pool } from "../db/pool";
import { normalizeHashtag } from "../services/hashtagValidation";
import { getCachedResolution, setCachedResolution } from "../services/cache";

const router = Router();

// Fast-path resolution for the payment router / social bots: primary destination,
// payout splits, and preferred settlement asset. Cached 60s to survive RPC rate limits.
router.get("/hashtags/resolve/:hashtag", async (req, res, next) => {
  try {
    const hashtag = normalizeHashtag(req.params.hashtag);

    const cached = await getCachedResolution(hashtag);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const { rows } = await pool.query(
      "SELECT hashtag, owner_wallet, active, expires_at FROM hashtags WHERE hashtag = $1",
      [hashtag],
    );
    if (rows.length === 0 || !rows[0].active) {
      res.status(404).json({ error: "hashtag not active" });
      return;
    }

    const payouts = await pool.query(
      "SELECT wallet, percentage_bps FROM payout_recipients WHERE hashtag = $1",
      [hashtag],
    );

    const resolution = {
      hashtag,
      primaryDestination: rows[0].owner_wallet,
      payouts: payouts.rows,
      expiresAt: rows[0].expires_at,
    };

    await setCachedResolution(hashtag, resolution);
    res.json(resolution);
  } catch (err) {
    next(err);
  }
});

export default router;
