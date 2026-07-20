import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  listPendingForWallet,
  getPendingTransaction,
  markBroadcast,
  markCancelled,
} from "../services/x/pendingTransactionService";
import { getTransactionReceipt } from "../services/onchain/client";
import { postReceiptReply } from "../services/x/receiptReply";
import type { Hash } from "viem";

const router = Router();

router.get("/transactions/pending", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const rows = await listPendingForWallet(req.walletAddress!);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/transactions/pending/:id/broadcast", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { tx_hash } = req.body as { tx_hash?: string };
    if (!tx_hash) {
      res.status(400).json({ error: "tx_hash is required" });
      return;
    }

    const pending = await getPendingTransaction(Number(req.params.id), req.walletAddress!);
    if (!pending) {
      res.status(404).json({ error: "pending transaction not found" });
      return;
    }
    if (pending.status !== "pending") {
      res.status(409).json({ error: `transaction is already ${pending.status}` });
      return;
    }

    const receipt = await getTransactionReceipt(tx_hash as Hash);
    if (receipt.status !== "success") {
      res.status(400).json({ error: "transaction reverted onchain" });
      return;
    }

    await markBroadcast(pending.id, tx_hash);
    res.json({ synced: true });

    // Only mention-triggered requests have a tweet_url (source_ref is that
    // tweet's own id in that case) -- DMs have no public tweet to reply to.
    // Fired after the response, not awaited: the QR receipt is a courtesy,
    // not something the client should wait on, and its failure must never
    // turn an already-successful onchain settlement into an error response.
    if (pending.tweet_url && pending.source_ref) {
      void postReceiptReply(pending.source_ref, tx_hash);
    }
  } catch (err) {
    next(err);
  }
});

router.post("/transactions/pending/:id/cancel", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const pending = await getPendingTransaction(Number(req.params.id), req.walletAddress!);
    if (!pending) {
      res.status(404).json({ error: "pending transaction not found" });
      return;
    }
    if (pending.status !== "pending") {
      res.status(409).json({ error: `transaction is already ${pending.status}` });
      return;
    }

    await markCancelled(pending.id);
    res.json({ cancelled: true });
  } catch (err) {
    next(err);
  }
});

export default router;
