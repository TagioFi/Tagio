import { Router } from "express";
import { parseV2BotIntent } from "../services/groqIntentParser";
import { routeBotPaymentIntent } from "../services/xBotRoutingService";

const router = Router();

// POST /v2/bot/parse-intent — Free-text natural language parser via Groq AI
router.post("/v2/bot/parse-intent", async (req, res, next) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const intent = await parseV2BotIntent(text);
    res.json(intent);
  } catch (err) {
    next(err);
  }
});

// POST /v2/bot/route-intent — Route natural text or structured command into a settlement plan
router.post("/v2/bot/route-intent", async (req, res, next) => {
  try {
    const { senderWallet, text, recipientInput, amount, token } = req.body as {
      senderWallet?: string;
      text?: string;
      recipientInput?: string;
      amount?: number;
      token?: string;
    };

    if (!senderWallet) {
      res.status(400).json({ error: "senderWallet is required" });
      return;
    }

    let target = recipientInput;
    let targetAmount = amount;
    let targetToken = token || "USDG";

    // If free-form text is passed, parse via Groq first
    if (text && (!target || !targetAmount)) {
      const parsed = await parseV2BotIntent(text);
      if (parsed.action !== "send" || !parsed.target || !parsed.amount) {
        res.status(400).json({
          error: "Could not identify a send action, target recipient, or amount from text.",
          parsedIntent: parsed,
        });
        return;
      }
      target = parsed.target;
      targetAmount = parsed.amount;
      targetToken = parsed.token || "USDG";
    }

    if (!target || !targetAmount || targetAmount <= 0) {
      res.status(400).json({ error: "recipientInput and positive amount are required" });
      return;
    }

    const plan = await routeBotPaymentIntent({
      senderWallet,
      recipientInput: target,
      amount: targetAmount,
      tokenSymbolOrAddress: targetToken,
    });

    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
