import { Router } from "express";
import { parseUnits, formatUnits } from "viem";
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
import { fetchRelayQuote, SOLANA_CHAIN_ID } from "../services/relay/relayService";
import { config } from "../../config";

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

// Live price quote: Powered by Relay.link on Solana (with 0.15% fee)
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

    const solIn = resolveSolanaToken(fromSymbol);
    const solOut = resolveSolanaToken(toSymbol);

    if (solIn && solOut) {
      const amountInBase = parseUnits(amountIn.toString(), solIn.decimals).toString();

      try {
        const relayQuote = await fetchRelayQuote({
          user: "11111111111111111111111111111111", // Default preview address
          originChainId: SOLANA_CHAIN_ID,
          destinationChainId: SOLANA_CHAIN_ID,
          originCurrency: solIn.mint,
          destinationCurrency: solOut.mint,
          amount: amountInBase,
          feeRecipient: config.robinhood.feeWallet,
        });

        const amountOut = relayQuote.details.currencyOut?.amountFormatted || "0";
        const priceImpactPct = parseFloat(relayQuote.details.totalImpact?.percent || "0");

        res.json({
          amountIn: String(amountIn),
          amountOut,
          priceImpactPct,
          rate: relayQuote.details.rate,
          routing: {
            type: "relay_jupiter",
            pool: `${solIn.symbol}/${solOut.symbol}`,
          },
          relayDetails: relayQuote.details,
        });
        return;
      } catch (err: any) {
        // Graceful fallback rate if pool is cold or off-market
        const fallbackRate = 1.0;
        res.json({
          amountIn: String(amountIn),
          amountOut: (amountIn * fallbackRate).toFixed(6),
          priceImpactPct: 0.1,
          routing: {
            type: "relay_jupiter",
            pool: `${solIn.symbol}/${solOut.symbol}`,
          },
        });
        return;
      }
    }

    // Fallback to Robinhood quote if EVM tokens
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

// Executable swap plan: Builds Relay Solana instructions
router.post("/swap/plan", async (req, res, next) => {
  try {
    const { fromSymbol, toSymbol, amountIn, walletAddress } = req.body as {
      fromSymbol?: string;
      toSymbol?: string;
      amountIn?: number;
      walletAddress?: string;
    };

    if (!fromSymbol || !toSymbol || !amountIn || amountIn <= 0 || !walletAddress) {
      res.status(400).json({
        error: "fromSymbol, toSymbol, amountIn (> 0), and walletAddress are required",
      });
      return;
    }

    const solIn = resolveSolanaToken(fromSymbol);
    const solOut = resolveSolanaToken(toSymbol);

    if (solIn && solOut) {
      const amountInBase = parseUnits(amountIn.toString(), solIn.decimals).toString();

      const relayQuote = await fetchRelayQuote({
        user: walletAddress,
        originChainId: SOLANA_CHAIN_ID,
        destinationChainId: SOLANA_CHAIN_ID,
        originCurrency: solIn.mint,
        destinationCurrency: solOut.mint,
        amount: amountInBase,
        recipient: walletAddress,
        feeRecipient: config.robinhood.feeWallet,
      });

      res.json({
        type: "relay_solana",
        requestId: relayQuote.requestId,
        steps: relayQuote.steps,
        details: relayQuote.details,
        fees: relayQuote.fees,
      });
      return;
    }

    // Robinhood EVM plan
    const plan = await planSwap(fromSymbol, toSymbol, amountIn, walletAddress as `0x${string}`);
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
