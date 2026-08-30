import { Router } from "express";
import { fetchRelayQuote, getRelayIntentStatus, GetQuoteParams } from "../services/relay/relayService";
import { config } from "../../config";

const router = Router();

router.post("/relay/quote", async (req, res, next) => {
  try {
    const {
      user,
      originCurrency,
      destinationCurrency,
      amount,
      recipient,
      txs,
      // Forwarded so the frontend can price the Robinhood leg of a contract
      // call before committing to it: a payable call (receivePayment, donate)
      // needs a msg.value denominated in destination-chain ETH, which is only
      // knowable by first quoting the plain bridge. fetchRelayQuote already
      // accepted all three; the route just wasn't passing them through.
      originChainId,
      destinationChainId,
      tradeType,
    } = req.body as GetQuoteParams;

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
      originChainId,
      destinationChainId,
      tradeType,
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
