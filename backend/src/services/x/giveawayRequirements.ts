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

// Qualifies once the pool reaches `threshold` -- resolving winners (random
// sample of N) is the caller's job, this only answers "is there enough of a
// pool to draw from yet."
export async function checkRequirement(
  targetPostId: string,
  requirementType: RequirementType,
  threshold: number,
): Promise<RequirementCheck> {
  const candidates = await getCandidatePool(targetPostId, requirementType);
  return { qualifies: candidates.length >= threshold, candidates };
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
