import { Router } from "express";
import { pool } from "../db/pool";
import { normalizeHashtag, isValidHashtag } from "../services/hashtagValidation";
import { confirmTransaction } from "../services/hashtagService";
import type { Hash } from "viem";

const router = Router();

router.get("/hashtags/check/:name", async (req, res, next) => {
  try {
    const hashtag = normalizeHashtag(req.params.name);
    if (!isValidHashtag(hashtag)) {
      res.json({ available: false, reason: "invalid_format" });
      return;
    }
    const { rows } = await pool.query(
      "SELECT 1 FROM hashtags WHERE hashtag = $1 AND active = true",
      [hashtag],
    );
    res.json({ available: rows.length === 0 });
  } catch (err) {
    next(err);
  }
});

router.get("/hashtags/:name", async (req, res, next) => {
  try {
    const hashtag = normalizeHashtag(req.params.name);
    const { rows } = await pool.query("SELECT * FROM hashtags WHERE hashtag = $1", [hashtag]);
    if (rows.length === 0) {
      res.status(404).json({ error: "hashtag not found" });
      return;
    }

    const [payouts, socials] = await Promise.all([
      pool.query("SELECT wallet, percentage_bps FROM payout_recipients WHERE hashtag = $1", [hashtag]),
      pool.query("SELECT key, value FROM social_links WHERE hashtag = $1", [hashtag]),
    ]);

    res.json({ ...rows[0], payouts: payouts.rows, socials: socials.rows });
  } catch (err) {
    next(err);
  }
});

router.post("/hashtags/confirm-transaction", async (req, res, next) => {
  try {
    const { tx_hash, hashtag_raw } = req.body as { tx_hash?: string; hashtag_raw?: string };
    if (!tx_hash || !hashtag_raw) {
      res.status(400).json({ error: "tx_hash and hashtag_raw are required" });
      return;
    }
    await confirmTransaction(tx_hash as Hash, hashtag_raw);
    res.json({ synced: true });
  } catch (err) {
    next(err);
  }
});

export default router;
