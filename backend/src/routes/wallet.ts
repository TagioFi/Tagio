import { Router } from "express";
import { erc20Abi, getAddress, isAddress } from "viem";
import { getPublicClient } from "../services/onchain/client";
import { ETH, USDG, STOCK_TOKENS } from "../lib/rwaTokens";
import { pool } from "../db/pool";
import { getLinkedXAccountByWallet } from "../services/x/xAccountService";

const router = Router();

// All the assets the Trade/Send wallet panels show -- ETH + USDG always,
// plus whichever of the curated RWA stocks the wallet actually holds.
router.get("/wallet/:address/balances", async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) {
      res.status(400).json({ error: "invalid address" });
      return;
    }
    const owner = getAddress(address);
    const client = getPublicClient();

    const balances = await Promise.all(
      [ETH, USDG, ...STOCK_TOKENS].map(async (token) => {
        const balance = token.native
          ? await client.getBalance({ address: owner })
          : await client.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [owner],
            });
        return {
          symbol: token.symbol,
          address: token.address,
          native: Boolean(token.native),
          decimals: token.decimals,
          balance: balance.toString(),
        };
      }),
    );

    res.json(balances);
  } catch (err) {
    next(err);
  }
});

// "Who is this wallet" lookup -- surfaced from e.g. a private send's
// recipient address, so the sender can see whatever this wallet is
// publicly known as (linked X handle, top hashtags it owns), without
// exposing anything not already public elsewhere (hashtag ownership is
// already a public lookup; wallet<->X handle linkage is already knowable
// from the bot's own public replies).
router.get("/wallet/:address/identity", async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!isAddress(address)) {
      res.status(400).json({ error: "invalid address" });
      return;
    }
    const owner = getAddress(address);

    const [linkedX, hashtags] = await Promise.all([
      getLinkedXAccountByWallet(owner),
      pool.query(
        "SELECT hashtag, name, total_volume_usd FROM hashtags WHERE LOWER(owner_wallet) = LOWER($1) AND active = true ORDER BY total_volume_usd DESC LIMIT 5",
        [owner],
      ),
    ]);

    res.json({ xHandle: linkedX?.xHandle ?? null, hashtags: hashtags.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
