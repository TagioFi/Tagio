import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import {
  listPrivateSendsForWallet,
  findPrivateSendById,
  createPrivateSendRow,
  linkPendingTransaction,
  preparePrivateSend,
  buildUnsignedClaim,
  type PrivateSendRow,
} from "../services/x/privateSendService";
import { createPendingPrivateSend, createPendingPrivateSendClaim } from "../services/x/pendingTransactionService";
import { getLinkedXAccountByWallet, getLinkedXAccountByHandle } from "../services/x/xAccountService";
import type { BotToken } from "../services/x/commandParser";

const router = Router();

// Never includes `secret` or `commitment` -- both are the only proof needed
// to claim, so they're backend-internal (used only when actually building a
// claim tx), never returned to any client, including the sender/recipient
// themselves via this listing.
function serializePrivateSend(row: PrivateSendRow) {
  return {
    id: row.id,
    senderWallet: row.sender_wallet,
    recipientWallet: row.recipient_wallet,
    token: row.token,
    amount: row.amount,
    keeperFeeWei: row.keeper_fee_base_units, // always native ETH wei, regardless of `token` -- see PrivateSendPool.sol
    status: row.status,
    sentTxHash: row.sent_tx_hash,
    claimedTxHash: row.claimed_tx_hash,
    claimedBy: row.claimed_by,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
  };
}

router.get("/private-sends", async (req, res, next) => {
  try {
    const wallet = typeof req.query.wallet === "string" ? req.query.wallet : null;
    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      res.status(400).json({ error: "wallet query param required" });
      return;
    }
    const rows = await listPrivateSendsForWallet(wallet);
    res.json(rows.map(serializePrivateSend));
  } catch (err) {
    next(err);
  }
});

// Dashboard-native equivalent of the $psend bot command -- resolves the
// recipient straight from our own x_accounts table (no X API call needed,
// unlike the bot's handler which only starts with raw @handle text). Same
// policy as the bot: the recipient must already be a linked wallet. Creates
// the pending_transactions row the sender then signs via the normal Pending
// tab flow -- this endpoint never signs or broadcasts anything itself.
router.post("/private-sends", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { recipientHandle, amount, token } = req.body as {
      recipientHandle?: string;
      amount?: string;
      token?: BotToken;
    };
    if (!recipientHandle || !amount || (token !== "native" && token !== "usdg")) {
      res.status(400).json({ error: "recipientHandle, amount, and token ('native'|'usdg') are required" });
      return;
    }

    const sender = await getLinkedXAccountByWallet(req.walletAddress!);
    if (!sender) {
      res.status(409).json({ error: "your wallet isn't linked to an X account" });
      return;
    }
    const recipient = await getLinkedXAccountByHandle(recipientHandle);
    if (!recipient) {
      res.status(404).json({ error: "couldn't find a linked TagioPay wallet for that handle" });
      return;
    }

    const senderWallet = req.walletAddress as `0x${string}`;
    const recipientWallet = recipient.walletAddress as `0x${string}`;
    const prepared = await preparePrivateSend(senderWallet, recipientWallet, amount, token);

    const row = await createPrivateSendRow({
      commitment: prepared.commitment,
      secret: prepared.secret,
      senderWallet,
      senderXUserId: sender.xUserId,
      recipientWallet,
      recipientXUserId: recipient.xUserId,
      token,
      amount,
      amountBaseUnits: prepared.amountBaseUnits,
      keeperFeeBaseUnits: prepared.keeperFeeBaseUnits,
    });

    const created = await createPendingPrivateSend({
      requestedByWallet: senderWallet,
      requestedByXUserId: sender.xUserId,
      sourceRef: `dapp-psend-${row.id}`,
      commitment: prepared.commitment,
      token,
      amount,
      amountBaseUnits: prepared.amountBaseUnits,
      approvals: prepared.approvals,
      send: prepared.send,
    });

    if (!created) {
      res.status(409).json({ error: "this private send was already created" });
      return;
    }
    await linkPendingTransaction(row.id, created.id);
    res.json({ created: true, id: row.id, pendingTransactionId: created.id });
  } catch (err) {
    next(err);
  }
});

// Manual claim, dashboard-native -- same fallback as $claim, but resolved by
// row id + connected-wallet match instead of X identity, so it works even
// for a recipient who never linked X in the first place... except sends
// currently always require a linked recipient to be created at all (see
// above), so in practice this always matches an X-linked wallet too; kept
// wallet-based rather than X-based here since that's the auth this endpoint
// actually has (JWT -> wallet), not an X session.
router.post("/private-sends/:id/claim", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }

    const row = await findPrivateSendById(id);
    if (!row) {
      res.status(404).json({ error: "private send not found" });
      return;
    }
    if (row.recipient_wallet.toLowerCase() !== req.walletAddress!.toLowerCase()) {
      res.status(403).json({ error: "you're not the recipient of this private send" });
      return;
    }
    if (row.status !== "sent") {
      res.status(409).json({ error: `this private send is ${row.status}, not claimable` });
      return;
    }

    const claim = buildUnsignedClaim(
      row.commitment as `0x${string}`,
      req.walletAddress as `0x${string}`,
      row.secret as `0x${string}`,
    );
    const created = await createPendingPrivateSendClaim({
      requestedByWallet: req.walletAddress!,
      requestedByXUserId: row.recipient_x_user_id,
      sourceRef: `dapp-psend-claim-${row.id}`,
      commitment: row.commitment,
      token: row.token,
      amount: row.amount,
      claim,
    });
    if (!created) {
      res.status(409).json({ error: "a claim for this private send was already created" });
      return;
    }
    res.json({ created: true, pendingTransactionId: created.id });
  } catch (err) {
    next(err);
  }
});

export default router;
