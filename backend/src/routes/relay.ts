import { Router } from "express";
import { fetchRelayQuote, getRelayIntentStatus, GetQuoteParams } from "../services/relay/relayService";
import { config } from "../config";

const router = Router();

router.post("/relay/quote", async (req, res, next) => {
  try {
    const { user, originCurrency, destinationCurrency, amount, recipient, txs } = req.body as GetQuoteParams;

    if (!user || !originCurrency || !amount) {
      res.status(400).json({ error: "user, originCurrency, and amount are required" });
      return;
    }

    const quote = await fetchRelayQuote({
      user,
      originCurrency,
      destinationCurrency,
      amount,
      recipient,
      txs,
      feeRecipient: config.robinhood.feeWallet,
    });

    res.json(quote);
  } catch (err) {
    next(err);
  }
});

router.get("/relay/intent/:requestId", async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!requestId) {
      res.status(400).json({ error: "requestId is required" });
      return;
    }

    const status = await getRelayIntentStatus(requestId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
