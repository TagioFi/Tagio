import { listNewMentions, listRecentDirectMessages, replyToMention, replyToDirectMessage } from "./botClient";
import { getCursor, setCursor } from "./botCursor";
import { parseCommand } from "./commandParser";
import { resolveTargetWallet } from "./targetResolver";
import { buildUnsignedTransfer, buildUnsignedHashtagPayment } from "./txBuilder";
import { getWalletByXUserId } from "./xAccountService";
import { createPendingTransaction } from "./pendingTransactionService";
import { log } from "../../lib/logger";

// No links in bot replies (by design -- the dapp link lives in the bot's bio
// instead) and no reply at all for unparseable commands or senders who aren't a
// linked TagioPay+X user. Both are pure noise-reduction: it keeps the bot from
// burning reply-rate-limit budget on spam/non-users, and non-users get nothing
// to latch onto for a reply-chain.
const REPLY_CREATED = "Transaction created — tap the link in my bio to review and sign it in your dashboard.";
const REPLY_TARGET_NOT_FOUND =
  "Couldn't find that hashtag, wallet, or linked X account — double check it and try again.";
const REPLY_UNSUPPORTED_HASHTAG_TOKEN =
  "That token isn't supported for hashtag payments yet — try ETH instead, or send directly to a wallet or linked account.";

interface IncomingMessage {
  id: string;
  text: string;
  authorId: string;
  reply: (text: string) => Promise<void>;
  tweetUrl?: string;
  source: "mention" | "dm";
}

async function handleMessage(msg: IncomingMessage): Promise<void> {
  // Base context attached to every decision log for this message so a single
  // id/source can be grepped to see exactly what the bot did and why. Tweet
  // text is public (it's a mention), so it's safe to include for debugging
  // parse misses; DM text is private, so it's deliberately left out here.
  const ctx = { source: msg.source, id: msg.id, authorId: msg.authorId };

  const command = parseCommand(msg.text);
  if (!command) {
    log.info("x_bot_message_ignored", {
      ...ctx,
      reason: "unparseable",
      textSnippet: msg.source === "mention" ? msg.text.slice(0, 80) : undefined,
    });
    return; // not a recognized command -- silently ignore, no reply
  }

  const requesterWallet = await getWalletByXUserId(msg.authorId);
  if (!requesterWallet) {
    log.info("x_bot_message_ignored", { ...ctx, reason: "sender_not_linked" });
    return; // not a linked TagioPay user -- silently ignore, no reply
  }

  const resolvedWallet = await resolveTargetWallet(command);
  if (!resolvedWallet) {
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
