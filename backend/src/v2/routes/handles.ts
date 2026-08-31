import { Router } from "express";
import { isAddress } from "viem";
import { pool } from "../../db/pool";
import {
  getHandleDetails,
  registerHandle,
  updateHandleElections,
  listHandlesByOwner,
  V2ElectionInput,
} from "../services/handleService";

const router = Router();

// GET /v2/handles/:handle — Fetch handle details and active portfolio election
router.get("/v2/handles/:handle", async (req, res, next) => {
  try {
    const details = await getHandleDetails(req.params.handle);
    if (!details) {
      res.status(404).json({ error: `Handle not found: #${req.params.handle}` });
      return;
    }
    res.json(details);
  } catch (err) {
    next(err);
  }
});

// POST /v2/handles/register — Register a new handle with portfolio mix (requires verified X identity)
router.post("/v2/handles/register", async (req, res, next) => {
  try {
    const {
      handle,
      ownerWallet,
      displayName,
      avatarUrl,
      bio,
      metadata,
      elections,
    } = req.body as {
      handle?: string;
      ownerWallet?: string;
      displayName?: string;
      avatarUrl?: string;
      bio?: string;
      metadata?: Record<string, any>;
      elections?: V2ElectionInput[];
    };

    if (!handle || !ownerWallet) {
      res.status(400).json({ error: "handle and ownerWallet are required" });
      return;
    }

    if (!isAddress(ownerWallet)) {
      res.status(400).json({ error: "ownerWallet must be a valid EVM address" });
      return;
    }

    const normalizedWallet = ownerWallet.toLowerCase();

    // Verify that the claiming wallet has an authenticated X identity in v2_wallet_identities
    const identityRes = await pool.query(
      "SELECT x_user_id, x_handle FROM v2_wallet_identities WHERE LOWER(wallet_address) = $1 LIMIT 1",
      [normalizedWallet]
    );

    if (identityRes.rows.length === 0 || !identityRes.rows[0].x_user_id) {
      res.status(403).json({
        error: "A verified X (Twitter) account must be linked before claiming a tag. Please sign in with X first.",
        needsXLink: true,
      });
      return;
    }

    const identity = identityRes.rows[0];

    const registered = await registerHandle({
      handle,
      ownerWallet: normalizedWallet,
      xUserId: identity.x_user_id,
      xHandle: identity.x_handle,
      displayName,
      avatarUrl,
      bio,
      metadata,
      elections,
    });

    res.status(201).json(registered);
  } catch (err: any) {
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      res.status(409).json({ error: "That handle is already registered." });
      return;
    }
    next(err);
  }
});

// PUT /v2/handles/:handle/elections — Update receive-side target portfolio mix
router.put("/v2/handles/:handle/elections", async (req, res, next) => {
  try {
    const { ownerWallet, elections } = req.body as {
      ownerWallet?: string;
      elections?: V2ElectionInput[];
    };

    if (!ownerWallet || !elections || !Array.isArray(elections)) {
      res.status(400).json({ error: "ownerWallet and elections array are required" });
      return;
    }

    const updated = await updateHandleElections(req.params.handle, ownerWallet, elections);
    res.json(updated);
  } catch (err: any) {
    if (err.message?.includes("Unauthorized")) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err.message?.includes("must equal 10,000")) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// GET /v2/handles/owner/:walletAddress — List all handles owned by a wallet
router.get("/v2/handles/owner/:walletAddress", async (req, res, next) => {
  try {
    const handles = await listHandlesByOwner(req.params.walletAddress);
    res.json(handles);
  } catch (err) {
    next(err);
  }
});

export default router;
