import { listNewMentions, listRecentDirectMessages, replyToMention, replyToDirectMessage, getUserByUsername } from "./botClient";
import { getCursor, setCursor } from "./botCursor";
import { parseCommand, parseSwapCommand, parseCauseCommand, parseDonateToName, parseEscrowCommand, parsePrivateSendCommand, isClaimCommand, type ParsedEscrowCommand } from "./commandParser";
import { resolveTargetWallet } from "./targetResolver";
import { buildUnsignedTransfer, buildUnsignedHashtagPayment, buildUnsignedDeposit } from "./txBuilder";
import { getWalletByXUserId } from "./xAccountService";
import { createPendingTransaction, createPendingSwap, createPendingDeposit } from "./pendingTransactionService";
import { resolveToken } from "../../lib/rwaTokens";
import { planSwap } from "../../lib/swapExecution";
import { parseIntent } from "./intentParser";
import {
  getOpenClarification,
  saveClarification,
  clearClarification,
  buildClarificationReply,
  COULD_NOT_PROCESS_REPLY,
} from "./clarificationService";
import { handleGiveawayIntent } from "./giveawayHandler";
import { handleHoldAirdrop, handleBullpostAirdrop } from "./airdropHandler";
import { handleCauseCommand, handleDonateToName } from "./causeHandler";
import { handleEscrowCommand } from "./escrowHandler";
import { handlePrivateSendCommand, handleClaimCommand } from "./privateSendHandler";
import { log } from "../../lib/logger";

// No links in bot replies (by design -- the dapp link lives in the bot's bio
// instead) and no reply at all for unparseable commands or senders who aren't a
// linked TagioPay+X user. Both are pure noise-reduction: it keeps the bot from
// burning reply-rate-limit budget on spam/non-users, and non-users get nothing
// to latch onto for a reply-chain.
const REPLY_CREATED = "Transaction created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_TARGET_NOT_FOUND =
  "Couldn't find that hashtag, wallet, or linked X account. Double check it and try again.";
const REPLY_UNSUPPORTED_HASHTAG_TOKEN =
  "That token isn't supported for hashtag payments yet. Try ETH instead, or send directly to a wallet or linked account.";
const REPLY_SWAP_TOKEN_NOT_FOUND =
  "Didn't recognize one of those tokens. Try a symbol like ETH, USDG, AAPL, NVDA, GOOGL, TSLA, AMZN, MSFT, META, COIN, or SPCX.";
const REPLY_SWAP_NO_ROUTE = "No liquidity route for that pair yet. Try a different amount or pair.";
const REPLY_ALLOCATION_RESERVED =
  "That account hasn't linked TagioPay yet -- tap the link in my bio to review and sign the deposit. It's held in escrow for 120 days and unlocks automatically once they link.";

interface IncomingMessage {
  id: string;
  text: string;
  authorId: string;
  reply: (text: string) => Promise<void>;
  tweetUrl?: string;
  source: "mention" | "dm";
  // The post this message is a reply to, if any -- only ever set for
  // mentions (DMs have no concept of replying to a tweet). Giveaway
  // requires this; send/swap ignore it entirely.
  repliedToTweetId?: string | null;
}

// Returns true if this message was fully handled here (either a deposit was
// offered for signing, or a duplicate was silently ignored) -- false means
// the handle doesn't resolve (genuinely doesn't exist on X, or the lookup
// itself failed), so the caller falls through to its normal "target not
// found" decline instead of reserving anything. That catch matters: this
// function is called from inside pollMentions()'s per-message loop, which
// has no per-iteration try/catch of its own -- letting a transient X API
// error (not just a clean 404) propagate out of here would abort the rest
// of that poll batch *before* the cursor advances, so the same messages
// get reprocessed on every subsequent poll instead of just this one call
// getting skipped.
async function reserveUnclaimedAllocation(
  msg: IncomingMessage,
  ctx: Record<string, unknown>,
  requesterWallet: `0x${string}`,
  command: NonNullable<ReturnType<typeof parseCommand>>,
): Promise<boolean> {
  let target: { id: string; username: string } | null;
  try {
    target = await getUserByUsername(command.targetValue);
  } catch (err) {
    log.warn("x_bot_allocation_lookup_failed", {
      ...ctx,
      targetValue: command.targetValue,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  if (!target) return false;

  // Builds a real ClaimEscrow deposit for the SENDER to sign -- the
  // allocation record itself is only created once this actually broadcasts
  // successfully (routes/pendingTransactions.ts), so it never represents an
  // unfunded promise.
  const depositPlan = await buildUnsignedDeposit(command.token, requesterWallet, target.id, command.amount);
  const created = await createPendingDeposit({
    requestedByWallet: requesterWallet,
    requestedByXUserId: msg.authorId,
    sourceRef: msg.id,
    targetXUserId: target.id,
    targetXHandle: target.username,
    token: command.token,
    amount: command.amount,
    amountBaseUnits: depositPlan.amountBaseUnits,
    approvals: depositPlan.approvals,
    deposit: depositPlan.deposit,
    tweetUrl: msg.tweetUrl,
  });

  if (created) {
    log.info("x_bot_deposit_created", {
      ...ctx,
      pendingTransactionId: created.id,
      targetXUserId: target.id,
      targetHandle: target.username,
      token: command.token,
      amount: command.amount,
    });
    await msg.reply(REPLY_ALLOCATION_RESERVED);
  } else {
    log.info("x_bot_message_ignored", { ...ctx, reason: "duplicate_source_ref" });
  }
  return true;
}

async function handlePaymentCommand(
  msg: IncomingMessage,
  ctx: Record<string, unknown>,
  requesterWallet: `0x${string}`,
  command: NonNullable<ReturnType<typeof parseCommand>>,
): Promise<void> {
  const resolvedWallet = await resolveTargetWallet(command);
  if (!resolvedWallet) {
    // An unlinked @handle isn't necessarily a dead end -- if the account is
    // real, reserve the send as an unclaimed allocation instead of dropping
    // it (Wave 1). A genuinely bad handle (typo, doesn't exist) falls
    // through to the normal decline below.
    if (command.targetType === "x_account") {
      const reserved = await reserveUnclaimedAllocation(msg, ctx, requesterWallet, command);
      if (reserved) return;
    }
    log.info("x_bot_message_declined", {
      ...ctx,
      reason: "target_not_found",
      targetType: command.targetType,
      targetValue: command.targetValue,
    });
    await msg.reply(REPLY_TARGET_NOT_FOUND);
    return;
  }

  // Hashtag targets route through the resolver's receivePayment/receiveTokenPayment
  // so a bot-initiated payment respects that hashtag's payout splits exactly like
  // a dapp-initiated one does. Wallet/X-account targets have no split concept, so
  // they stay a plain transfer.
  const unsignedTransfer =
    command.targetType === "hashtag"
      ? await buildUnsignedHashtagPayment(command.token, command.targetValue, command.amount)
      : buildUnsignedTransfer(command.token, resolvedWallet, command.amount);

  if (!unsignedTransfer) {
    log.info("x_bot_message_declined", { ...ctx, reason: "unsupported_hashtag_token", token: command.token });
    await msg.reply(REPLY_UNSUPPORTED_HASHTAG_TOKEN);
    return;
  }

  const created = await createPendingTransaction({
    requestedByWallet: requesterWallet,
    requestedByXUserId: msg.authorId,
    sourceRef: msg.id,
    targetType: command.targetType,
    targetValue: command.targetValue,
    resolvedToWallet: resolvedWallet,
    token: command.token,
    amount: command.amount,
    unsignedTransfer,
    tweetUrl: msg.tweetUrl,
  });

  if (created) {
    log.info("x_bot_pending_transaction_created", {
      ...ctx,
      pendingTransactionId: created.id,
      targetType: command.targetType,
      targetValue: command.targetValue,
      token: command.token,
      amount: command.amount,
      requesterWallet,
    });
    await msg.reply(REPLY_CREATED);
  } else {
    log.info("x_bot_message_ignored", { ...ctx, reason: "duplicate_source_ref" });
  }
}

async function handleSwapCommand(
  msg: IncomingMessage,
  ctx: Record<string, unknown>,
  requesterWallet: `0x${string}`,
  swapCommand: NonNullable<ReturnType<typeof parseSwapCommand>>,
): Promise<void> {
  const [tokenIn, tokenOut] = await Promise.all([
    resolveToken(swapCommand.fromSymbol),
    resolveToken(swapCommand.toSymbol),
  ]);
  if (!tokenIn || !tokenOut || tokenIn.address === tokenOut.address) {
    log.info("x_bot_message_declined", {
      ...ctx,
      reason: "swap_token_not_found",
      fromSymbol: swapCommand.fromSymbol,
      toSymbol: swapCommand.toSymbol,
    });
    await msg.reply(REPLY_SWAP_TOKEN_NOT_FOUND);
    return;
  }

  const plan = await planSwap(swapCommand.fromSymbol, swapCommand.toSymbol, Number(swapCommand.amount), requesterWallet);
  if (!plan) {
    log.info("x_bot_message_declined", {
      ...ctx,
      reason: "swap_no_route",
      fromSymbol: swapCommand.fromSymbol,
      toSymbol: swapCommand.toSymbol,
    });
    await msg.reply(REPLY_SWAP_NO_ROUTE);
    return;
  }

  const created = await createPendingSwap({
    requestedByWallet: requesterWallet,
    requestedByXUserId: msg.authorId,
    sourceRef: msg.id,
    fromSymbol: swapCommand.fromSymbol,
    toSymbol: swapCommand.toSymbol,
    amount: swapCommand.amount,
    amountInBaseUnits: plan.amountInBaseUnits,
    approvals: plan.approvals,
    swap: plan.swap,
    route: plan.quote.route,
    priceImpactPct: plan.quote.priceImpactPct,
    tweetUrl: msg.tweetUrl,
  });

  if (created) {
    log.info("x_bot_pending_swap_created", {
      ...ctx,
      pendingTransactionId: created.id,
      fromSymbol: swapCommand.fromSymbol,
      toSymbol: swapCommand.toSymbol,
      amount: swapCommand.amount,
      route: plan.quote.route,
      priceImpactPct: plan.quote.priceImpactPct,
      requesterWallet,
    });
    await msg.reply(REPLY_CREATED);
  } else {
    log.info("x_bot_message_ignored", { ...ctx, reason: "duplicate_source_ref" });
  }
}

// Wraps the whole per-message flow in one catch-all. pollMentions()/
// pollDirectMessages() process a batch in a plain for-loop with no
// per-iteration try/catch of their own, and only advance their cursor
// *after* every message in the batch has been handled -- an uncaught error
// from any single message (a bad handle lookup, a transient X API hiccup,
// anything) would otherwise abort the rest of the batch and the cursor
// advance with it, so every message in it gets reprocessed on every
// subsequent poll instead of just this one being skipped.
async function handleMessage(msg: IncomingMessage): Promise<void> {
  // Base context attached to every decision log for this message so a single
  // id/source can be grepped to see exactly what the bot did and why. Tweet
  // text is public (it's a mention), so it's safe to include for debugging
  // parse misses; DM text is private, so it's deliberately left out here.
  const ctx = { source: msg.source, id: msg.id, authorId: msg.authorId };

  try {
    const command = parseCommand(msg.text);
    const swapCommand = command ? null : parseSwapCommand(msg.text);
    const causeCommand = command || swapCommand ? null : parseCauseCommand(msg.text);
    const donateToName = command || swapCommand || causeCommand ? null : parseDonateToName(msg.text);
    const escrowCommand =
      command || swapCommand || causeCommand || donateToName ? null : parseEscrowCommand(msg.text);
    const privateSendCommand =
      command || swapCommand || causeCommand || donateToName || escrowCommand
        ? null
        : parsePrivateSendCommand(msg.text);
    const claimCommand =
      command || swapCommand || causeCommand || donateToName || escrowCommand || privateSendCommand
        ? false
        : isClaimCommand(msg.text);

    if (command || swapCommand || causeCommand || donateToName || escrowCommand || privateSendCommand || claimCommand) {
      const requesterWallet = await getWalletByXUserId(msg.authorId);
      if (!requesterWallet) {
        log.info("x_bot_message_ignored", { ...ctx, reason: "sender_not_linked" });
        return; // not a linked TagioPay user -- silently ignore, no reply
      }
      if (command) {
        await handlePaymentCommand(msg, ctx, requesterWallet as `0x${string}`, command);
      } else if (swapCommand) {
        await handleSwapCommand(msg, ctx, requesterWallet as `0x${string}`, swapCommand);
      } else if (causeCommand) {
        await handleCauseCommand(causeCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      } else if (donateToName) {
        await handleDonateToName(donateToName, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      } else if (escrowCommand) {
        await handleEscrowCommand(escrowCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply, msg.tweetUrl);
      } else if (privateSendCommand) {
        await handlePrivateSendCommand(privateSendCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      } else {
        await handleClaimCommand(requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      }
      return;
    }

    // Neither deterministic parser matched -- try Groq for giveaway/airdrop/
    // escrow. Same linked-sender gate as send/swap: an unlinked user's
    // request is silently ignored, not just because they can't fund it, but
    // so a stranger can't burn a Groq call on this bot's behalf just by
    // mentioning it.
    const requesterWallet = await getWalletByXUserId(msg.authorId);
    if (!requesterWallet) {
      log.info("x_bot_message_ignored", { ...ctx, reason: "sender_not_linked" });
      return;
    }

    const openClarification = await getOpenClarification(msg.authorId);
    const intent = await parseIntent(
      msg.text,
      openClarification
        ? { partialIntent: openClarification.partialIntent, missingSlots: openClarification.missingSlots }
        : undefined,
    );

    // A user gets at most ONE follow-up per request (confirmed 2026-07-20).
    // If there's already an open clarification, this message IS that one
    // follow-up reply -- resolve it one way or the other and clear it,
    // never ask again regardless of what Groq comes back with.
    if (openClarification) {
      await clearClarification(msg.authorId);
      if (intent.action === "unrecognized" || intent.missingSlots.length > 0) {
        await msg.reply(COULD_NOT_PROCESS_REPLY);
        log.info("x_bot_could_not_process", { ...ctx, afterFollowUp: true });
        return;
      }
      // else: fully resolved -- fall through to execute below.
    } else {
      // A fresh message, no prior clarification thread.
      if (intent.action === "unrecognized") {
        log.info("x_bot_message_ignored", {
          ...ctx,
          reason: "unparseable",
          textSnippet: msg.source === "mention" ? msg.text.slice(0, 80) : undefined,
        });
        return; // not clearly an attempt at any command -- silently ignore, no reply
      }
      if (intent.missingSlots.length > 0) {
        await saveClarification({
          xUserId: msg.authorId,
          source: msg.source,
          sourceRef: msg.id,
          partialIntent: { ...intent },
          missingSlots: intent.missingSlots,
        });
        await msg.reply(buildClarificationReply(intent.missingSlots));
        log.info("x_bot_clarification_asked", { ...ctx, missingSlots: intent.missingSlots });
        return;
      }
      // else: fully resolved on the first try -- fall through to execute below.
    }

    if (intent.action === "giveaway") {
      await handleGiveawayIntent(
        intent,
        msg.repliedToTweetId ?? null,
        msg.id,
        requesterWallet as `0x${string}`,
        msg.authorId,
        msg.reply,
      );
    } else if (intent.action === "escrow") {
      // Same "create" shape parseEscrowCommand's regex would have produced --
      // handleEscrowCommand doesn't know or care whether a command came from
      // the strict regex or Groq's looser extraction.
      const escrowCommand: ParsedEscrowCommand = {
        action: "create",
        description: intent.escrowDescription!,
        amount: intent.amount!.toString(),
        token: intent.token === "eth" ? "native" : "usdg",
        counterpartyHandle: intent.escrowCounterpartyHandle!,
      };
      await handleEscrowCommand(escrowCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply, msg.tweetUrl);
    } else if (intent.airdropMode === "hold") {
      await handleHoldAirdrop(intent, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
    } else if (intent.airdropMode === "bullpost") {
      await handleBullpostAirdrop(intent, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
    } else {
      log.info("x_bot_message_ignored", { ...ctx, reason: "airdrop_mode_unclear" });
    }
  } catch (err) {
    log.error("x_bot_message_handling_failed", { ...ctx, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function pollMentions(): Promise<void> {
  const sinceId = await getCursor("mentions");
  const mentions = await listNewMentions(sinceId);
  if (mentions.length === 0) return; // routine empty poll -- no log, keep noise-free

  log.info("x_bot_mentions_fetched", { count: mentions.length, sinceId });

  // X returns newest-first; process oldest-first so cursor advances correctly.
  const ordered = [...mentions].reverse();
  for (const mention of ordered) {
    await handleMessage({
      id: mention.id,
      text: mention.text,
      authorId: mention.authorId,
      reply: (text) => replyToMention(mention.id, text),
      tweetUrl: `https://x.com/i/status/${mention.id}`,
      source: "mention",
      repliedToTweetId: mention.repliedToTweetId,
    });
  }
  const lastSeenId = ordered[ordered.length - 1].id;
  await setCursor("mentions", lastSeenId);
  log.info("x_bot_mentions_cursor_advanced", { lastSeenId });
}

export async function pollDirectMessages(): Promise<void> {
  const lastSeenId = await getCursor("dms");
  const recent = await listRecentDirectMessages();
  const lastSeen = lastSeenId ? BigInt(lastSeenId) : 0n;

  const unseen = recent.filter((dm) => BigInt(dm.id) > lastSeen).sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? 1 : -1));
  if (unseen.length === 0) return; // routine empty poll -- no log, keep noise-free

  log.info("x_bot_dms_fetched", { count: unseen.length });

  for (const dm of unseen) {
    await handleMessage({
      id: dm.id,
      text: dm.text,
      authorId: dm.senderId,
      reply: (text) => replyToDirectMessage(dm.dmConversationId, text),
      source: "dm",
    });
  }
  const newLastSeenId = unseen[unseen.length - 1].id;
  await setCursor("dms", newLastSeenId);
  log.info("x_bot_dms_cursor_advanced", { lastSeenId: newLastSeenId });
}
