import { isAddress, getAddress } from "viem";
import { getTopHolders } from "./blockscout";
import { searchRecentPosts } from "./botClient";
import { getWalletByXUserId } from "./xAccountService";
import { buildGiveawayPayout, type GiveawayWinner } from "./txBuilder";
import { createPendingDisperse } from "./pendingTransactionService";
import type { ParsedIntent } from "./intentParser";
import type { BotToken } from "./commandParser";
import { log } from "../../lib/logger";

// Publicly documented so anyone can verify how their share was computed:
// retweets weighted highest (they extend reach to a new audience), replies
// next (real engagement, but easier to spam than a retweet), likes as the
// lightest baseline signal.
export const ENGAGEMENT_WEIGHTS = { like: 1, reply: 2, retweet: 3 } as const;

const REPLY_HOLD_AIRDROP_NO_HOLDERS = "That token has no holders to airdrop to.";
const REPLY_HOLD_AIRDROP_BAD_ADDRESS = "That doesn't look like a real token contract address.";
const REPLY_BULLPOST_NO_POSTS = "No recent posts matched that keyword in the last 7 days -- nothing to airdrop.";
const REPLY_AIRDROP_CREATED =
  "Airdrop created. Tap the link in my bio to review and sign the payout in your dashboard.";

function tokenFromIntent(token: "eth" | "usdg"): BotToken {
  return token === "eth" ? "native" : "usdg";
}

async function resolveWallets(refs: { id: string; username: string }[]): Promise<GiveawayWinner[]> {
  return Promise.all(
    refs.map(async (r) => ({
      xUserId: r.id,
      wallet: (await getWalletByXUserId(r.id)) as `0x${string}` | null,
      amount: "0",
    })),
  );
}

// Same "last one absorbs the remainder" convention as giveaway's equal
// split and HashtagResolver's own percentage-based payouts -- avoids
// rounding drift from the total sum across many small shares.
function weightedAmounts(totalAmount: string, weights: number[]): string[] {
  const total = parseFloat(totalAmount);
  const sumWeights = weights.reduce((s, w) => s + w, 0);
  if (sumWeights === 0) return weights.map(() => "0");

  const amounts = weights.map((w) => (Math.floor(((total * w) / sumWeights) * 1e8) / 1e8).toString());
  const distributed = amounts.slice(0, -1).reduce((s, a) => s + parseFloat(a), 0);
  amounts[amounts.length - 1] = (total - distributed).toFixed(8);
  return amounts;
}

async function createAirdropPending(
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  token: BotToken,
  totalAmount: string,
  winners: GiveawayWinner[],
): Promise<{ id: number } | null> {
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
    source: "airdrop",
  });
}

// Hold-airdrop: no unclaimed_allocations path -- there's no reverse
// wallet->X-handle lookup, so holders are always paid directly by address,
// never routed through ClaimEscrow. Synchronous: if the token has no
// holders right now, decline immediately rather than waiting.
export async function handleHoldAirdrop(
  intent: ParsedIntent,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  if (!intent.tokenAddress || !isAddress(intent.tokenAddress)) {
    await reply(REPLY_HOLD_AIRDROP_BAD_ADDRESS);
    return;
  }
  if (!intent.amount || !intent.token) return; // clarification already handled upstream

  const tokenAddress = getAddress(intent.tokenAddress);
  const holderCount = intent.recipientCount ?? 50; // doc's own example: "top 50 holders" as the default headcount
  const holders = await getTopHolders(tokenAddress, holderCount);
  if (holders.length === 0) {
    await reply(REPLY_HOLD_AIRDROP_NO_HOLDERS);
    return;
  }

  const token = tokenFromIntent(intent.token);
  const amounts = weightedAmounts(
    intent.amount.toString(),
    holders.map((h) => Number(h.balance)),
  );
  const winners: GiveawayWinner[] = holders.map((h, i) => ({ xUserId: "", wallet: h.address, amount: amounts[i]! }));

  const created = await createAirdropPending(
    requesterWallet,
    requesterXUserId,
    sourceRef,
    token,
    intent.amount.toString(),
    winners,
  );
  if (created) {
    await reply(REPLY_AIRDROP_CREATED);
    log.info("x_bot_hold_airdrop_created", {
      sourceRef,
      tokenAddress,
      holderCount: holders.length,
      pendingTransactionId: created.id,
    });
  }
}

// Bullpost-airdrop: pays the top N posters (by requester-chosen headcount)
// about a keyword, weighted by ENGAGEMENT_WEIGHTS. Also synchronous -- no
// matching posts means decline immediately. Poster resolution reuses the
// same linked/unlinked branching as giveaway (buildGiveawayPayout handles
// unlinked winners via ClaimEscrow deposits automatically).
export async function handleBullpostAirdrop(
  intent: ParsedIntent,
  requesterWallet: `0x${string}`,
  requesterXUserId: string,
  sourceRef: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  if (!intent.keyword || !intent.amount || !intent.token || !intent.recipientCount) return; // clarification handled upstream

  const posts = await searchRecentPosts(intent.keyword);
  if (posts.length === 0) {
    await reply(REPLY_BULLPOST_NO_POSTS);
    return;
  }

  // Sum engagement per unique poster -- someone who bullposted more than
  // once about the keyword gets their scores combined, not just their best
  // single post.
  const scoreByAuthor = new Map<string, { username: string; score: number }>();
  for (const post of posts) {
    const score =
      post.likeCount * ENGAGEMENT_WEIGHTS.like +
      post.replyCount * ENGAGEMENT_WEIGHTS.reply +
      post.retweetCount * ENGAGEMENT_WEIGHTS.retweet;
    const existing = scoreByAuthor.get(post.authorId);
    scoreByAuthor.set(post.authorId, {
      username: post.authorUsername,
      score: (existing?.score ?? 0) + score,
    });
  }

  const topPosters = [...scoreByAuthor.entries()]
    .map(([xUserId, v]) => ({ xUserId, username: v.username, score: v.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, intent.recipientCount);

  const token = tokenFromIntent(intent.token);
  const resolved = await resolveWallets(topPosters.map((p) => ({ id: p.xUserId, username: p.username })));
  const amounts = weightedAmounts(
    intent.amount.toString(),
    topPosters.map((p) => p.score),
  );
  const winners: GiveawayWinner[] = resolved.map((w, i) => ({ ...w, amount: amounts[i]! }));

  const created = await createAirdropPending(
    requesterWallet,
    requesterXUserId,
    sourceRef,
    token,
    intent.amount.toString(),
    winners,
  );
  if (created) {
    await reply(REPLY_AIRDROP_CREATED);
    log.info("x_bot_bullpost_airdrop_created", {
      sourceRef,
      keyword: intent.keyword,
      posterCount: winners.length,
      pendingTransactionId: created.id,
    });
  }
}
