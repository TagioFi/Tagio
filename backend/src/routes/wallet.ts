import { Router } from "express";
import { erc20Abi, getAddress, isAddress } from "viem";
import { getPublicClient } from "../services/onchain/client";
import { ETH, USDG, STOCK_TOKENS } from "../lib/rwaTokens";

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

export default router;
