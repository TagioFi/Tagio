import { checkRequirement, pickRandomWinners } from "./giveawayRequirements";
import {
  createGiveawayRequest,
  listWaitingGiveawayRequests,
  listExpiredWaitingRequests,
  markGiveawayFulfilled,
  markGiveawayExpired,
} from "./giveawayRequestService";
import { getWalletByXUserId } from "./xAccountService";
import { buildGiveawayPayout, type GiveawayWinner } from "./txBuilder";
import { createPendingDisperse } from "./pendingTransactionService";
import { replyToMention } from "./botClient";
import type { ParsedIntent, RequirementType } from "./intentParser";
import type { BotToken } from "./commandParser";
import { log } from "../../lib/logger";

export const REPLY_GIVEAWAY_NEEDS_REPLY_CONTEXT =
  "Reply to the post you want to run this giveaway on -- a bare mention has no target post to check engagement against.";

function tokenFromIntent(token: "eth" | "usdg"): BotToken {
  return token === "eth" ? "native" : "usdg";
}

async function resolveWinnerWallets(winners: { id: string; username: string }[]): Promise<GiveawayWinner[]> {
  return Promise.all(
    winners.map(async (w) => ({
      xUserId: w.id,
      wallet: (await getWalletByXUserId(w.id)) as `0x${string}` | null,
      amount: "0", // filled in by the caller once the equal-split amount is known
    })),
  );
}

function equalSplitAmounts(totalAmount: string, count: number): string[] {
  // Equal split (confirmed for giveaway -- luck-based, not merit-based).
  // Divide to 8 decimal places and put any leftover dust on the last winner,
  // same "last one absorbs the remainder" convention HashtagResolver's own
  // payout splitting already uses for percentage-based shares.
  const total = parseFloat(totalAmount);
  const base = Math.floor((total / count) * 1e8) / 1e8;
  const amounts = new Array(count).fill(base.toString());
  const distributed = base * (count - 1);
  amounts[count - 1] = (total - distributed).toFixed(8);
  return amounts;
}

async function payOutWinners(
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  token: BotToken,
  totalAmount: string,
  winnerRefs: { id: string; username: string }[],
): Promise<{ id: number } | null> {
  const resolved = await resolveWinnerWallets(winnerRefs);
  const amounts = equalSplitAmounts(totalAmount, resolved.length);
  const winners: GiveawayWinner[] = resolved.map((w, i) => ({ ...w, amount: amounts[i]! }));

  const plan = await buildGiveawayPayout(token, requesterWallet, winners);
  return createPendingDisperse({
    requestedByWallet: requesterWallet,
    requestedByXUserId: requesterXUserId,
    sourceRef,
    token,
    totalAmount: plan.totalAmount,
    totalAmountBaseUnits: plan.totalAmountBaseUnits,
    recipientCount: winners.length,
    approvals: plan.approvals,
    primary: plan.primary,
    extraSteps: plan.extraSteps,
    source: "giveaway",
  });
}

function winnerAnnouncement(winners: { id: string; username: string }[]): string {
  const handles = winners.map((w) => `@${w.username}`).join(", ");
  return `Giveaway requirements met! Winners: ${handles}. Tap the link in my bio to review and sign the payout in your dashboard.`;
}

const REPLY_GIVEAWAY_EXPIRED = "Giveaway requirements weren't met in time -- nothing was sent.";

// Called from poller.ts when Groq classifies a mention as a giveaway.
// requesterWallet/requesterXUserId are the sender's (already confirmed
// linked -- see poller.ts). sourcePostId is the target post being replied
// to; requestTweetId is the mention itself.
export async function handleGiveawayIntent(
  intent: ParsedIntent,
  sourcePostId: string | null,
  requestTweetId: string,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  if (!sourcePostId) {
    await reply(REPLY_GIVEAWAY_NEEDS_REPLY_CONTEXT);
    return;
  }
  if (!intent.amount || !intent.token || !intent.winnerCount || !intent.requirementType) {
    // Slots incomplete -- Wave 2's follow-up asker handles this from the
    // caller (poller.ts checks intent.missingSlots before calling this
    // function at all); reaching here with something missing means an
    // inconsistent intent slipped through, so decline rather than guess.
    return;
  }

  const token = tokenFromIntent(intent.token);
  const requirementType = intent.requirementType as RequirementType;
  const threshold = intent.requirementThreshold ?? 1;

  const check = await checkRequirement(sourcePostId, requirementType, threshold);
  if (check.qualifies) {
    const winners = pickRandomWinners(check.candidates, intent.winnerCount);
    const created = await payOutWinners(
      requesterWallet,
      requesterXUserId,
      requestTweetId,
      token,
      intent.amount.toString(),
      winners,
    );
    if (created) {
      await reply(winnerAnnouncement(winners));
      log.info("x_bot_giveaway_fulfilled_immediately", { requestTweetId, sourcePostId, winnerCount: winners.length });
    }
    return;
  }

  // Not met yet -- wait up to 1 hour (the waiter poll, see
  // checkWaitingGiveaways below). No immediate reply: only fulfillment or
  // expiry get one, per the fixed reply bank.
  const created = await createGiveawayRequest({
    sourcePostId,
    requestTweetId,
    requesterWallet,
    requesterXUserId,
    requirementType,
    requirementThreshold: threshold,
    winnerCount: intent.winnerCount,
    amount: intent.amount.toString(),
    token,
  });
  if (created) {
    log.info("x_bot_giveaway_waiting", { requestTweetId, sourcePostId, requirementType, threshold });
  }
}

// Dedicated poll loop (own interval, own budget -- see index.ts) that
// re-checks open giveaway_requests and resolves the 1-hour expiry.
export async function checkWaitingGiveaways(): Promise<void> {
  const waiting = await listWaitingGiveawayRequests();
  for (const request of waiting) {
    try {
      const check = await checkRequirement(
        request.source_post_id,
        request.requirement_type as RequirementType,
        request.requirement_threshold,
      );
      if (!check.qualifies) continue;

      const winners = pickRandomWinners(check.candidates, request.winner_count);
      const created = await payOutWinners(
        request.requester_wallet,
        request.requester_x_user_id,
        request.request_tweet_id,
        request.token as BotToken,
        request.amount,
        winners,
      );
      if (created) {
        await replyToMention(request.request_tweet_id, winnerAnnouncement(winners));
        await markGiveawayFulfilled(request.id);
        log.info("x_bot_giveaway_fulfilled", { id: request.id, requestTweetId: request.request_tweet_id });
      }
    } catch (err) {
      log.error("x_bot_giveaway_check_failed", {
        id: request.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const expired = await listExpiredWaitingRequests();
  for (const request of expired) {
    try {
      await markGiveawayExpired(request.id);
      await replyToMention(request.request_tweet_id, REPLY_GIVEAWAY_EXPIRED);
      log.info("x_bot_giveaway_expired", { id: request.id, requestTweetId: request.request_tweet_id });
    } catch (err) {
      log.error("x_bot_giveaway_expire_failed", {
        id: request.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
