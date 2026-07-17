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

const WALLET_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

// The NFT contract isn't enumerable, so "which hashtags does this wallet own" has
// no onchain answer — this is the reverse-lookup our own Postgres index can serve.
router.get("/hashtags", async (req, res, next) => {
  try {
    const owner = req.query.owner;
    if (typeof owner !== "string" || !WALLET_ADDRESS_PATTERN.test(owner)) {
      res.status(400).json({ error: "owner query param must be a valid wallet address" });
      return;
    }

    const { rows } = await pool.query(
      "SELECT * FROM hashtags WHERE owner_wallet = $1 AND active = true ORDER BY registered_at DESC",
      [owner],
    );
    res.json(rows);
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
