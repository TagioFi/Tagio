import { Router } from "express";
import { routeBotPaymentIntent } from "../services/xBotRoutingService";

const router = Router();

// POST /v2/bot/route-intent — Route an X bot payment command
router.post("/v2/bot/route-intent", async (req, res, next) => {
  try {
    const { senderWallet, recipientInput, amount, token } = req.body as {
      senderWallet?: string;
      recipientInput?: string;
      amount?: number;
      token?: string;
    };

    if (!senderWallet || !recipientInput || !amount || amount <= 0) {
      res.status(400).json({ error: "senderWallet, recipientInput, and positive amount are required" });
      return;
    }

    const plan = await routeBotPaymentIntent({
      senderWallet,
      recipientInput,
      amount,
      tokenSymbolOrAddress: token || "USDG",
    });

    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
