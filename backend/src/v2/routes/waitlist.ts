import { Router } from "express";
import { pool } from "../../db/pool";

const router = Router();

// POST /v2/waitlist/facebook — Join Facebook Bot Early Access Waitlist
router.post("/v2/waitlist/facebook", async (req, res, next) => {
  try {
    const { handle, wallet } = req.body || {};
    if (!handle || typeof handle !== "string" || !handle.trim()) {
      return res.status(400).json({ error: "Please enter a valid Facebook handle or profile link." });
    }

    const cleanHandle = handle.trim().replace(/^@/, "");
    const cleanWallet = wallet && typeof wallet === "string" ? wallet.trim().toLowerCase() : null;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;

    // Check if already registered
    const existing = await pool.query(
      "SELECT id FROM facebook_waitlist WHERE LOWER(facebook_handle) = LOWER($1) LIMIT 1",
      [cleanHandle]
    );

    if (existing.rows.length > 0) {
      const countRes = await pool.query("SELECT COUNT(*) FROM facebook_waitlist");
      return res.json({
        success: true,
        alreadyRegistered: true,
        position: parseInt(existing.rows[0].id, 10),
        totalCount: parseInt(countRes.rows[0].count, 10),
        message: "You're already on the list! Priority access will be sent to your handle.",
      });
    }

    const insertRes = await pool.query(
      `INSERT INTO facebook_waitlist (facebook_handle, wallet_address, ip_address)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [cleanHandle, cleanWallet, ip]
    );

    const countRes = await pool.query("SELECT COUNT(*) FROM facebook_waitlist");
    const totalCount = parseInt(countRes.rows[0].count, 10);

    return res.json({
      success: true,
      position: insertRes.rows[0].id,
      totalCount,
      message: "Spot reserved! You're on the early access list for the TagioFi Facebook bot.",
    });
  } catch (err) {
    next(err);
  }
});

// GET /v2/waitlist/facebook/count — Public count of waitlist participants
router.get("/v2/waitlist/facebook/count", async (req, res, next) => {
  try {
    const countRes = await pool.query("SELECT COUNT(*) FROM facebook_waitlist");
    res.json({ totalCount: parseInt(countRes.rows[0].count, 10) });
  } catch (err) {
    next(err);
  }
});

export default router;
