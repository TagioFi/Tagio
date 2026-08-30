import { Router } from "express";
import { pool } from "../../db/pool";
import {
  quoteSingleSwap,
  quotePortfolioSettlement,
} from "../services/relaySwapService";
import { getHandleDetails } from "../services/handleService";
import { resolveV2Token, USDG } from "../lib/robinhoodTokens";

const router = Router();

// POST /v2/settle/quote — Single token-to-token Relay quote on Robinhood
router.post("/v2/settle/quote", async (req, res, next) => {
  try {
    const { fromSymbolOrAddress, toSymbolOrAddress, amountIn, userWallet, recipientWallet, slippageBps } = req.body as {
      fromSymbolOrAddress?: string;
      toSymbolOrAddress?: string;
      amountIn?: number;
      userWallet?: string;
      recipientWallet?: string;
      slippageBps?: number;
    };

    if (!fromSymbolOrAddress || !toSymbolOrAddress || !amountIn || amountIn <= 0) {
      res.status(400).json({ error: "fromSymbolOrAddress, toSymbolOrAddress, and positive amountIn are required" });
      return;
    }

    const fromToken = resolveV2Token(fromSymbolOrAddress);
    const toToken = resolveV2Token(toSymbolOrAddress);

    if (!fromToken || !toToken) {
      res.status(400).json({ error: "Invalid or unsupported token symbol/address" });
      return;
    }

    const quote = await quoteSingleSwap({
      userWallet: userWallet || "0x0000000000000000000000000000000000000000",
      recipientWallet: recipientWallet || userWallet,
      fromToken,
      toToken,
      amountIn,
      slippageBps,
    });

    res.json(quote);
  } catch (err) {
    next(err);
  }
});

// POST /v2/settle/election-quote — Multi-leg receive-side portfolio quote
router.post("/v2/settle/election-quote", async (req, res, next) => {
  try {
    const { recipientHandle, fromSymbolOrAddress, amountIn, userWallet, slippageBps } = req.body as {
      recipientHandle?: string;
      fromSymbolOrAddress?: string;
      amountIn?: number;
      userWallet?: string;
      slippageBps?: number;
    };

    if (!recipientHandle || !amountIn || amountIn <= 0) {
      res.status(400).json({ error: "recipientHandle and positive amountIn are required" });
      return;
    }

    const handleDetails = await getHandleDetails(recipientHandle);
    if (!handleDetails) {
      res.status(404).json({ error: `Recipient handle not found: #${recipientHandle}` });
      return;
    }

    const fromToken = resolveV2Token(fromSymbolOrAddress || "USDG") || USDG;

    const portfolioQuote = await quotePortfolioSettlement({
      userWallet: userWallet || "0x0000000000000000000000000000000000000000",
      recipientWallet: handleDetails.ownerWallet,
      recipientHandle: handleDetails.handle,
      fromToken,
      totalAmountIn: amountIn,
      elections: handleDetails.elections.map((e) => ({
        symbol: e.symbol,
        tokenAddress: e.tokenAddress,
        basisPoints: e.basisPoints,
        percentage: e.percentage,
        token: e.token || resolveV2Token(e.symbol) || USDG,
      })),
      slippageBps,
    });

    res.json(portfolioQuote);
  } catch (err) {
    next(err);
  }
});

// POST /v2/settle/confirm — Record confirmed settlement receipt
router.post("/v2/settle/confirm", async (req, res, next) => {
  try {
    const {
      txHash,
      requestId,
      senderWallet,
      recipientHandle,
      recipientWallet,
      inputTokenSymbol,
      inputTokenAddress,
      inputAmount,
      outputBreakdown,
      feeCollectedUsd,
    } = req.body as {
      txHash?: string;
      requestId?: string;
      senderWallet?: string;
      recipientHandle?: string;
      recipientWallet?: string;
      inputTokenSymbol?: string;
      inputTokenAddress?: string;
      inputAmount?: string;
      outputBreakdown?: any[];
      feeCollectedUsd?: number;
    };

    if (!senderWallet || !recipientWallet || !inputTokenSymbol || !inputAmount) {
      res.status(400).json({ error: "senderWallet, recipientWallet, inputTokenSymbol, and inputAmount are required" });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO v2_settlements (
        request_id, tx_hash, sender_wallet, recipient_handle, recipient_wallet,
        input_token_symbol, input_token_address, input_amount, output_breakdown, fee_collected_usd
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        requestId || null,
        txHash || null,
        senderWallet.toLowerCase(),
        recipientHandle ? recipientHandle.replace(/^#|^@/, "").toLowerCase() : null,
        recipientWallet.toLowerCase(),
        inputTokenSymbol,
        inputTokenAddress || "0x0000000000000000000000000000000000000000",
        inputAmount,
        JSON.stringify(outputBreakdown || []),
        feeCollectedUsd || 0,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /v2/settle/history — List settlement receipts
router.get("/v2/settle/history", async (req, res, next) => {
  try {
    const wallet = typeof req.query.wallet === "string" ? req.query.wallet.toLowerCase() : null;
    const handle = typeof req.query.handle === "string" ? req.query.handle.replace(/^#|^@/, "").toLowerCase() : null;

    let query = "SELECT * FROM v2_settlements WHERE 1=1";
    const values: any[] = [];

    if (wallet) {
      values.push(wallet);
      query += ` AND (LOWER(sender_wallet) = $${values.length} OR LOWER(recipient_wallet) = $${values.length})`;
    }

    if (handle) {
      values.push(handle);
      query += ` AND LOWER(recipient_handle) = $${values.length}`;
    }

    query += " ORDER BY created_at DESC LIMIT 50";

    const { rows } = await pool.query(query, values);
    res.json({ total: rows.length, settlements: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
