import { Router } from "express";
import { pool } from "../../db/pool";
import { normalizeHashtag, isValidHashtag } from "../services/hashtagValidation";
import { confirmTransaction } from "../services/hashtagService";
import { getLinkedXAccountByHandle, isSolanaAddress } from "../services/x/xAccountService";
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
      "SELECT * FROM hashtags WHERE LOWER(owner_wallet) = LOWER($1) AND active = true ORDER BY registered_at DESC",
      [owner],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Spec Module 6: does this X handle have a wallet linked yet? Drives the
// send box's "they'll get it instantly" vs "this will sit in ClaimEscrow
// until they link their X account" branch. Exposes nothing that isn't
// already public — the bot's own replies reveal the same linkage.
router.get("/hashtags/user/:handle", async (req, res, next) => {
  try {
    const handle = req.params.handle.replace(/^@+/, "").trim().toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) {
      res.status(400).json({ error: "invalid X handle" });
      return;
    }

    const account = await getLinkedXAccountByHandle(handle);
    if (!account) {
      res.json({ handle, linked: false, wallet: null, solanaWallet: null, hashtags: [] });
      return;
    }

    // Hashtag ownership is recorded against the Robinhood-side address, so the
    // reverse lookup has to use that one, not whichever wallet linked first.
    const evmWallet = account.evmWalletAddress ?? account.walletAddress;
    const solanaWallet =
      account.solanaWalletAddress ??
      (isSolanaAddress(account.walletAddress) ? account.walletAddress : null);

    const { rows } = await pool.query(
      `SELECT hashtag, name, total_volume_usd FROM hashtags
       WHERE LOWER(owner_wallet) = LOWER($1) AND active = true
       ORDER BY total_volume_usd DESC LIMIT 5`,
      [evmWallet],
    );

    res.json({
      handle: account.xHandle,
      linked: true,
      wallet: account.walletAddress,
      // Present means a plain Solana transfer reaches them directly; absent
      // means a send has to go to ClaimEscrow until they link a Solana wallet.
      solanaWallet,
      hashtags: rows,
    });
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
