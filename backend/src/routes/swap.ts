import { Router } from "express";
import { isAddress } from "viem";
import { ETH, USDG, STOCK_TOKENS, resolveToken } from "../lib/rwaTokens";
import { quoteSwap } from "../lib/uniswapV3";
import { planSwap } from "../lib/swapExecution";

const router = Router();

// The token picker for the dapp's Trade view -- ETH/USDG plus the curated
// RWA allowlist. No auth needed; this is just a static reference list.
router.get("/tokens", (_req, res) => {
  res.json({ swapIn: [ETH, USDG], stocks: STOCK_TOKENS });
});

// Live preview only -- no unsigned tx is built here, just enough to show the
// user an expected rate and price-impact warning before they commit to a
// trade. Public: reads no wallet-specific state.
router.post("/swap/quote", async (req, res, next) => {
  try {
    const { fromSymbol, toSymbol, amountIn } = req.body as {
      fromSymbol?: string;
      toSymbol?: string;
      amountIn?: number;
    };
    if (!fromSymbol || !toSymbol || !amountIn || amountIn <= 0) {
      res.status(400).json({ error: "fromSymbol, toSymbol, and a positive amountIn are required" });
      return;
    }

    const [tokenIn, tokenOut] = await Promise.all([resolveToken(fromSymbol), resolveToken(toSymbol)]);
    if (!tokenIn || !tokenOut) {
      res.status(404).json({ error: "unrecognized token symbol or address" });
      return;
    }

    const quote = await quoteSwap(fromSymbol, toSymbol, amountIn);
    if (!quote) {
      res.status(422).json({ error: "no route found -- this pair has no liquidity yet" });
      return;
    }
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

// Builds real, freshly-quoted unsigned transactions (0-2 approvals + the
// swap itself) for the connected wallet to sign. Always re-quotes internally
// rather than trusting an earlier /swap/quote call -- see planSwap's own
// comment on why a stale quote is exactly the kind of gap that causes a
// thin-pool swap's minimum-out to be wrong by the time it's signed.
router.post("/swap/plan", async (req, res, next) => {
  try {
    const { fromSymbol, toSymbol, amountIn, walletAddress } = req.body as {
      fromSymbol?: string;
      toSymbol?: string;
      amountIn?: number;
      walletAddress?: string;
    };
    if (!fromSymbol || !toSymbol || !amountIn || amountIn <= 0 || !walletAddress) {
      res.status(400).json({ error: "fromSymbol, toSymbol, a positive amountIn, and walletAddress are required" });
      return;
    }
    if (!isAddress(walletAddress)) {
      res.status(400).json({ error: "walletAddress is not a valid address" });
      return;
    }

    const plan = await planSwap(fromSymbol, toSymbol, amountIn, walletAddress);
    if (!plan) {
      res.status(422).json({ error: "no route found -- this pair has no liquidity yet" });
      return;
    }
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
