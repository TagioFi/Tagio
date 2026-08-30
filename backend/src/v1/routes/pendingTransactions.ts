import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth";
import {
  listPendingForWallet,
  getPendingTransaction,
  markBroadcast,
  markCancelled,
} from "../services/x/pendingTransactionService";
import { createUnclaimedAllocation, markAllocationsClaimed } from "../services/x/unclaimedAllocationService";
import { markPrivateSendSent, markPrivateSendClaimed } from "../services/x/privateSendService";
import { getTransactionReceipt } from "../services/onchain/client";
import { postReceiptReply } from "../services/x/receiptReply";
import { postEscrowCreatedReply } from "../services/x/escrowHandler";
import type { Hash } from "viem";
import type { BotToken } from "../services/x/commandParser";

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

    // The escrow deposit/claim only becomes a real, book-kept fact once the
    // transaction that moves the actual funds has been confirmed successful
    // on-chain -- not when the pending row was merely created. This is what
    // fixes Wave 1's original gap: an unclaimed_allocations row never exists
    // without real escrowed funds behind it, and a claim never gets marked
    // settled until the sweep that pays it out actually lands.
    if (pending.kind === "deposit" && pending.target_x_user_id) {
      await createUnclaimedAllocation({
        xUserId: pending.target_x_user_id,
        xHandle: pending.target_value,
        token: pending.token as BotToken,
        amount: pending.amount,
        amountBaseUnits: pending.amount_base_units,
        source: "direct-send",
        sourceRef: pending.source_ref ?? undefined,
      });
    } else if (pending.kind === "claim" && pending.target_x_user_id) {
      await markAllocationsClaimed(pending.target_x_user_id, pending.token as BotToken);
    } else if (pending.kind === "psend") {
      // target_value holds the commitment (see createPendingPrivateSend) --
      // only from here on is this allocation real enough for the keeper to
      // attempt claiming.
      await markPrivateSendSent(pending.target_value, tx_hash);
    } else if (pending.kind === "psend_claim") {
      await markPrivateSendClaimed(pending.target_value, tx_hash, "self");
    }

    res.json({ synced: true });

    // Only mention-triggered requests have a tweet_url (source_ref is that
    // tweet's own id in that case) -- DMs have no public tweet to reply to.
    // Fired after the response, not awaited: the reply is a courtesy, not
    // something the client should wait on, and its failure must never turn
    // an already-successful onchain settlement into an error response.
    if (pending.tweet_url && pending.source_ref) {
      // Escrow creation gets its own reply (announcing the real #id, tagging
      // the counterparty) instead of the generic QR receipt -- the id doesn't
      // exist until this exact receipt, so this is the only place it can be
      // read from.
      if (pending.kind === "escrow" && pending.target_type === "escrow_create") {
        void postEscrowCreatedReply(pending.source_ref, receipt);
      } else {
        void postReceiptReply(pending.source_ref, tx_hash);
      }
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
