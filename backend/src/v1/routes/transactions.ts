import { Router } from "express";
import { pool } from "../../db/pool";
import { normalizeHashtag } from "../services/hashtagValidation";

const router = Router();

router.get("/transactions/hashtag", async (req, res, next) => {
  try {
    const hashtagParam = req.query.hashtag;
    if (typeof hashtagParam !== "string") {
      res.status(400).json({ error: "hashtag query param is required" });
      return;
    }
    const hashtag = normalizeHashtag(hashtagParam);
    const { rows } = await pool.query(
      "SELECT tx_hash AS signature, amount, token, is_native, chain, occurred_at AS timestamp FROM transactions WHERE hashtag = $1 ORDER BY occurred_at DESC",
      [hashtag],
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
