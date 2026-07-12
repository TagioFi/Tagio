import { Router } from "express";
import jwt from "jsonwebtoken";
import { verifyMessage } from "viem";
import { pool } from "../db/pool";
import { config } from "../config";

const router = Router();

const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";

router.post("/auth/signin", async (req, res, next) => {
  try {
    const { walletAddress, signature, message } = req.body as {
      walletAddress?: `0x${string}`;
      signature?: `0x${string}`;
      message?: string;
    };

    if (!walletAddress || !signature || !message) {
      res.status(400).json({ error: "walletAddress, signature, and message are required" });
      return;
    }

    const valid = await verifyMessage({
      address: walletAddress,
      message,
      signature,
    });

    if (!valid) {
      res.status(401).json({ error: "signature verification failed" });
      return;
    }

    await pool.query(
      `INSERT INTO users (wallet_address) VALUES ($1)
       ON CONFLICT (wallet_address) DO NOTHING`,
      [walletAddress.toLowerCase()],
    );

    const token = jwt.sign({ walletAddress }, config.jwtAccessSecret, { expiresIn: "7d" });
    res.json({ token, message: SIGNIN_MESSAGE });
  } catch (err) {
    next(err);
  }
});

export default router;
