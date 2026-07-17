import { listNewMentions, listRecentDirectMessages, replyToMention, replyToDirectMessage } from "./botClient";
import { getCursor, setCursor } from "./botCursor";
import { parseCommand } from "./commandParser";
import { resolveTargetWallet } from "./targetResolver";
import { buildUnsignedTransfer } from "./txBuilder";
import { getWalletByXUserId } from "./xAccountService";
import { createPendingTransaction } from "./pendingTransactionService";

// No links in bot replies (by design -- the dapp link lives in the bot's bio
// instead) and no reply at all for unparseable commands or senders who aren't a
// linked TagioPay+X user. Both are pure noise-reduction: it keeps the bot from
// burning reply-rate-limit budget on spam/non-users, and non-users get nothing
// to latch onto for a reply-chain.
const REPLY_CREATED = "Transaction created — tap the link in my bio to review and sign it in your dashboard.";
const REPLY_TARGET_NOT_FOUND =
  "Couldn't find that hashtag, wallet, or linked X account — double check it and try again.";

interface IncomingMessage {
  id: string;
  text: string;
  authorId: string;
  reply: (text: string) => Promise<void>;
}

async function handleMessage(msg: IncomingMessage): Promise<void> {
  const command = parseCommand(msg.text);
  if (!command) return; // not a recognized command -- silently ignore, no reply

  const requesterWallet = await getWalletByXUserId(msg.authorId);
  if (!requesterWallet) return; // not a linked TagioPay user -- silently ignore, no reply

  const resolvedWallet = await resolveTargetWallet(command);
  if (!resolvedWallet) {
    await msg.reply(REPLY_TARGET_NOT_FOUND);
    return;
  }

  const unsignedTransfer = buildUnsignedTransfer(command.token, resolvedWallet, command.amount);
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
  });

  if (created) {
    await msg.reply(REPLY_CREATED);
  }
}

export async function pollMentions(): Promise<void> {
  const sinceId = await getCursor("mentions");
  const mentions = await listNewMentions(sinceId);
  if (mentions.length === 0) return;

  // X returns newest-first; process oldest-first so cursor advances correctly.
  const ordered = [...mentions].reverse();
  for (const mention of ordered) {
    await handleMessage({
      id: mention.id,
      text: mention.text,
      authorId: mention.authorId,
      reply: (text) => replyToMention(mention.id, text),
    });
  }
  await setCursor("mentions", ordered[ordered.length - 1].id);
}

export async function pollDirectMessages(): Promise<void> {
  const lastSeenId = await getCursor("dms");
  const recent = await listRecentDirectMessages();
  const lastSeen = lastSeenId ? BigInt(lastSeenId) : 0n;

  const unseen = recent.filter((dm) => BigInt(dm.id) > lastSeen).sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? 1 : -1));
  if (unseen.length === 0) return;

  for (const dm of unseen) {
    await handleMessage({
      id: dm.id,
      text: dm.text,
      authorId: dm.senderId,
      reply: (text) => replyToDirectMessage(dm.dmConversationId, text),
    });
  }
  await setCursor("dms", unseen[unseen.length - 1].id);
}
