import { listNewMentions, listRecentDirectMessages, replyToMention, replyToDirectMessage, getUserByUsername } from "./botClient";
import { getCursor, setCursor } from "./botCursor";
import { parseCommand, parseSwapCommand, parseCauseCommand, parseDonateToName, parseEscrowCommand, parsePrivateSendCommand, isClaimCommand, type ParsedEscrowCommand } from "./commandParser";
import { resolveTargetWallet } from "./targetResolver";
import { buildUnsignedTransfer, buildUnsignedHashtagPayment, buildUnsignedDeposit } from "./txBuilder";
import { getWalletByXUserId } from "./xAccountService";
import { createPendingTransaction, createPendingSwap, createPendingDeposit } from "./pendingTransactionService";
import { resolveToken } from "../../lib/rwaTokens";
import { planSwap } from "../../lib/swapExecution";
import { parseV2BotIntent } from "../../../v2/services/groqIntentParser";
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

const REPLY_CREATED = "Transaction created. Tap the link in my bio to review and sign it in your dashboard.";
const REPLY_TARGET_NOT_FOUND =
  "Couldn't find that hashtag, wallet, or linked X account. Double check it and try again.";
const REPLY_UNSUPPORTED_HASHTAG_TOKEN =
  "That token isn't supported for hashtag payments yet. Try ETH instead, or send directly to a wallet or linked account.";
const REPLY_SWAP_TOKEN_NOT_FOUND =
  "Unsupported asset. TagioFi only supports verified Robinhood Chain RWAs: SPCX, AAPL, NVDA, TSLA, GOOGL, AMZN, MSFT, META, COIN, USDG, and ETH.";
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
  repliedToTweetId?: string | null;
}

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

async function handleMessage(msg: IncomingMessage): Promise<void> {
  const ctx = { source: msg.source, id: msg.id, authorId: msg.authorId };

  try {
    const requesterWallet = await getWalletByXUserId(msg.authorId);
    if (!requesterWallet) {
      log.info("x_bot_message_ignored", { ...ctx, reason: "sender_not_linked" });
      return;
    }

    // 1. Universal AI Intent Parsing with Groq
    const v2Intent = await parseV2BotIntent(msg.text);

    if (v2Intent.action === "send" && v2Intent.target && v2Intent.amount) {
      const token = v2Intent.token?.toLowerCase() === "eth" ? "native" : "usdg";
      const targetClean = v2Intent.target.replace(/^[@#]/, "");
      const targetType = v2Intent.targetType || (v2Intent.target.startsWith("@") ? "x_account" : v2Intent.target.startsWith("#") ? "hashtag" : "wallet");

      await handlePaymentCommand(msg, ctx, requesterWallet as `0x${string}`, {
        amount: String(v2Intent.amount),
        token,
        targetType,
        targetValue: targetClean,
      });
      return;
    }

    if (v2Intent.action === "swap" && v2Intent.amount && v2Intent.fromToken && v2Intent.toToken) {
      await handleSwapCommand(msg, ctx, requesterWallet as `0x${string}`, {
        amount: String(v2Intent.amount),
        fromSymbol: v2Intent.fromToken,
        toSymbol: v2Intent.toToken,
      });
      return;
    }

    // 2. Legacy commands fallback (causes, escrows, private sends, claims)
    const causeCommand = parseCauseCommand(msg.text);
    const donateToName = causeCommand ? null : parseDonateToName(msg.text);
    const escrowCommand = causeCommand || donateToName ? null : parseEscrowCommand(msg.text);
    const privateSendCommand = causeCommand || donateToName || escrowCommand ? null : parsePrivateSendCommand(msg.text);
    const claimCommand = causeCommand || donateToName || escrowCommand || privateSendCommand ? false : isClaimCommand(msg.text);

    if (causeCommand) {
      await handleCauseCommand(causeCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      return;
    }
    if (donateToName) {
      await handleDonateToName(donateToName, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      return;
    }
    if (escrowCommand) {
      await handleEscrowCommand(escrowCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply, msg.tweetUrl);
      return;
    }
    if (privateSendCommand) {
      await handlePrivateSendCommand(privateSendCommand, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      return;
    }
    if (claimCommand) {
      await handleClaimCommand(requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply);
      return;
    }

    // 3. Giveaway / Airdrop intent parsing
    const openClarification = await getOpenClarification(msg.authorId);
    const intent = await parseIntent(
      msg.text,
      openClarification
        ? { partialIntent: openClarification.partialIntent, missingSlots: openClarification.missingSlots }
        : undefined,
    );

    if (openClarification) {
      await clearClarification(msg.authorId);
      if (intent.action === "unrecognized" || intent.missingSlots.length > 0) {
        await msg.reply(COULD_NOT_PROCESS_REPLY);
        log.info("x_bot_could_not_process", { ...ctx, afterFollowUp: true });
        return;
      }
    } else {
      if (intent.action === "unrecognized") {
        log.info("x_bot_message_ignored", {
          ...ctx,
          reason: "unparseable",
          textSnippet: msg.source === "mention" ? msg.text.slice(0, 80) : undefined,
        });
        return;
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
      const escrowCmd: ParsedEscrowCommand = {
        action: "create",
        description: intent.escrowDescription!,
        amount: intent.amount!.toString(),
        token: intent.token === "eth" ? "native" : "usdg",
        counterpartyHandle: intent.escrowCounterpartyHandle!,
      };
      await handleEscrowCommand(escrowCmd, requesterWallet as `0x${string}`, msg.authorId, msg.id, msg.reply, msg.tweetUrl);
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
  if (mentions.length === 0) return;

  log.info("x_bot_mentions_fetched", { count: mentions.length, sinceId });

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
  const sinceId = await getCursor("dms");
  const events = await listRecentDirectMessages();
  if (events.length === 0) return;

  const ordered = [...events].reverse();
  let latestId = sinceId;

  for (const event of ordered) {
    if (sinceId && BigInt(event.id) <= BigInt(sinceId)) continue;
    await handleMessage({
      id: event.id,
      text: event.text,
      authorId: event.senderId,
      reply: (text) => replyToDirectMessage(event.senderId, text),
      source: "dm",
    });
    latestId = event.id;
  }

  if (latestId && latestId !== sinceId) {
    await setCursor("dms", latestId);
    log.info("x_bot_dms_cursor_advanced", { lastSeenId: latestId });
  }
}
