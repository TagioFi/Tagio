import { Router } from "express";
import {
  SOL,
  USDC,
  FEATURED_SOLANA_STOCKS,
  ALL_SOLANA_XSTOCKS,
  ETH,
  USDG,
  ROBINHOOD_STOCK_TOKENS,
  resolveToken,
  resolveSolanaToken,
} from "../lib/rwaTokens";
import { quoteSwap, type SwapQuote } from "../lib/uniswapV3";
import { planSwap } from "../lib/swapExecution";

const router = Router();

function toApiQuote({ amountOutWei: _amountOutWei, ...rest }: SwapQuote) {
  return rest;
}

// Token directory: Solana base currencies (SOL, USDC) and xStocks tokenized equities
router.get("/tokens", (_req, res) => {
  res.json({
    swapIn: [SOL, USDC],
    stocks: FEATURED_SOLANA_STOCKS,
    allStocks: ALL_SOLANA_XSTOCKS,
    robinhood: {
      swapIn: [ETH, USDG],
      stocks: ROBINHOOD_STOCK_TOKENS,
    },
  });
});

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

    // Check Solana first
    const solIn = resolveSolanaToken(fromSymbol);
    const solOut = resolveSolanaToken(toSymbol);

    if (solIn && solOut) {
      // In production, queries Jupiter Price API / Solana DEX aggregator quote
      // Estimated placeholder rate for xStocks on Solana:
      const estimatedRate = 1.0;
      const amountOut = (amountIn * estimatedRate).toFixed(6);
      res.json({
        amountIn: String(amountIn),
        amountOut,
        priceImpactPct: 0.1,
        routing: { type: "jupiter_solana", pool: `${solIn.symbol}/${solOut.symbol}` },
      });
      return;
    }

    // Fallback to Robinhood quote if EVM tokens
    const [tokenIn, tokenOut] = await Promise.all([resolveToken(fromSymbol), resolveToken(toSymbol)]);
    if (!tokenIn || !tokenOut) {
      res.status(404).json({ error: "unrecognized token symbol or address" });
      return;
    }

    const quote = await quoteSwap(fromSymbol, toSymbol, amountIn);
    if (!quote) {
      res.status(404).json({ error: "no liquidity route found for this pair" });
      return;
    }

    res.json(toApiQuote(quote));
  } catch (err) {
    next(err);
  }
});

router.post("/swap/plan", async (req, res, next) => {
  try {
    const { fromSymbol, toSymbol, amountIn, walletAddress } = req.body as {
      fromSymbol?: string;
      toSymbol?: string;
      amountIn?: number;
      walletAddress?: `0x${string}`;
    };

    if (!fromSymbol || !toSymbol || !amountIn || amountIn <= 0 || !walletAddress) {
      res.status(400).json({
        error: "fromSymbol, toSymbol, amountIn (> 0), and walletAddress are required",
      });
      return;
    }

    const plan = await planSwap(fromSymbol, toSymbol, amountIn, walletAddress);
    if (!plan) {
      res.status(404).json({ error: "failed to build swap plan (no route or quote failed)" });
      return;
    }

    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
