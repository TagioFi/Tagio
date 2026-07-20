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
import { resolveTargetWallet } from "../services/x/targetResolver";
import type { BotToken, BotTargetType } from "../services/x/commandParser";

// Same three target kinds the bot's $psend command accepts: @handle,
// #hashtag, or a raw 0xaddress -- a hashtag or wallet resolves to a
// concrete recipient with no X account needed at all.
function parseRecipientTarget(raw: string): { targetType: BotTargetType; targetValue: string } | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@")) return { targetType: "x_account", targetValue: trimmed.slice(1) };
  if (trimmed.startsWith("#")) return { targetType: "hashtag", targetValue: trimmed.slice(1).toLowerCase() };
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return { targetType: "wallet", targetValue: trimmed };
  return null;
}

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

// Dashboard-native equivalent of the $psend bot command -- same three
// target kinds (@handle, #hashtag, 0xaddress). A hashtag or raw wallet
// address resolves straight to a concrete recipient with no X account
// needed at all; only the @handle path requires the recipient to already
// be a linked wallet. Creates the pending_transactions row the sender then
// signs via the normal Pending tab flow -- this endpoint never signs or
// broadcasts anything itself.
router.post("/private-sends", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { recipient: recipientRaw, amount, token } = req.body as {
      recipient?: string;
      amount?: string;
      token?: BotToken;
    };
    if (!recipientRaw || !amount || (token !== "native" && token !== "usdg")) {
      res.status(400).json({ error: "recipient, amount, and token ('native'|'usdg') are required" });
      return;
    }
    const target = parseRecipientTarget(recipientRaw);
    if (!target) {
      res.status(400).json({ error: "recipient must be an @handle, #hashtag, or 0x wallet address" });
      return;
    }

    const sender = await getLinkedXAccountByWallet(req.walletAddress!);
    if (!sender) {
      res.status(409).json({ error: "your wallet isn't linked to an X account" });
      return;
    }

    let recipientWallet: string | null;
    let recipientXUserId: string | null = null;
    if (target.targetType === "x_account") {
      const recipient = await getLinkedXAccountByHandle(target.targetValue);
      if (!recipient) {
        res.status(404).json({ error: "couldn't find a linked TagioPay wallet for that handle" });
        return;
      }
      recipientWallet = recipient.walletAddress;
      recipientXUserId = recipient.xUserId;
    } else {
      recipientWallet = await resolveTargetWallet(target);
      if (!recipientWallet) {
        res.status(404).json({ error: `couldn't resolve that ${target.targetType === "hashtag" ? "hashtag" : "wallet"}` });
        return;
      }
    }

    const senderWallet = req.walletAddress as `0x${string}`;
    const prepared = await preparePrivateSend(senderWallet, recipientWallet as `0x${string}`, amount, token);

    const row = await createPrivateSendRow({
      commitment: prepared.commitment,
      secret: prepared.secret,
      senderWallet,
      senderXUserId: sender.xUserId,
      recipientWallet: recipientWallet as `0x${string}`,
      recipientXUserId,
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

    // row.recipient_x_user_id may be null (a #hashtag/wallet-targeted send
    // has no X account at all) -- but every dashboard user reaching this
    // authed endpoint has one regardless, since linking X is mandatory at
    // sign-in, so the caller's own account is the right one to use here,
    // not the send's (possibly absent) recorded recipient X id.
    const requester = await getLinkedXAccountByWallet(req.walletAddress!);
    const claim = buildUnsignedClaim(
      row.commitment as `0x${string}`,
      req.walletAddress as `0x${string}`,
      row.secret as `0x${string}`,
    );
    const created = await createPendingPrivateSendClaim({
      requestedByWallet: req.walletAddress!,
      requestedByXUserId: requester!.xUserId,
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
