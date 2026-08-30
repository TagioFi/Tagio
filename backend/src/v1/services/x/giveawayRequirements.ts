import { getLikingUsers, getRetweetedBy, getReplyAuthors, type XUserRef } from "./botClient";
import type { RequirementType } from "./intentParser";

export interface RequirementCheck {
  qualifies: boolean;
  candidates: XUserRef[];
}

// One endpoint per requirement type -- likes/retweets are direct user-list
// endpoints, comments has no direct equivalent so it goes through a
// conversation_id search instead (see getReplyAuthors).
async function getCandidatePool(targetPostId: string, requirementType: RequirementType): Promise<XUserRef[]> {
  switch (requirementType) {
    case "likes":
      return getLikingUsers(targetPostId);
    case "retweets":
      return getRetweetedBy(targetPostId);
    case "comments":
      return getReplyAuthors(targetPostId);
  }
}

// Qualifies once the pool reaches `threshold` AND has enough people to
// actually fill `winnerCount` distinct winner slots -- threshold alone isn't
// enough: it defaults to 1 whenever the requester didn't state a specific
// number (see intentParser.ts), which is unrelated to how many winners they
// asked for. Without the winnerCount floor, "send to any 2 people who
// retweeted this" could fulfill the instant a single retweet landed, paying
// out the whole amount to just that one person instead of waiting for a
// second (confirmed live 2026-07-29 on tagio: a 2-winner retweet giveaway
// paid its entire amount to one winner as soon as the first retweet arrived).
export async function checkRequirement(
  targetPostId: string,
  requirementType: RequirementType,
  threshold: number,
  winnerCount: number,
): Promise<RequirementCheck> {
  const candidates = await getCandidatePool(targetPostId, requirementType);
  return { qualifies: candidates.length >= Math.max(threshold, winnerCount), candidates };
}

// Fisher-Yates partial shuffle -- picks `count` distinct winners from the
// pool without bias toward earlier entries in the API response order.
export function pickRandomWinners(candidates: XUserRef[], count: number): XUserRef[] {
  const pool = [...candidates];
  const winners: XUserRef[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    winners.push(pool[i]!);
  }
  return winners;
}
