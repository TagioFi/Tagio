import { pool } from "../../../db/pool";
import type { BotToken } from "./commandParser";
import type { RequirementType } from "./intentParser";

export interface CreateGiveawayRequestInput {
  sourcePostId: string;
  requestTweetId: string;
  requesterWallet: string;
  requesterXUserId: string;
  requirementType: RequirementType;
  requirementThreshold: number;
  winnerCount: number;
  amount: string;
  token: BotToken;
}

// Idempotent per request_tweet_id -- reprocessing the same mention (e.g. an
// overlapping poll) doesn't create a second waiting request for it.
export async function createGiveawayRequest(
  input: CreateGiveawayRequestInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO giveaway_requests
       (source_post_id, request_tweet_id, requester_wallet, requester_x_user_id,
        requirement_type, requirement_threshold, winner_count, amount, token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (request_tweet_id) DO NOTHING
     RETURNING id`,
    [
      input.sourcePostId,
      input.requestTweetId,
      input.requesterWallet,
      input.requesterXUserId,
      input.requirementType,
      input.requirementThreshold,
      input.winnerCount,
      input.amount,
      input.token,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export async function listWaitingGiveawayRequests() {
  const { rows } = await pool.query(
    "SELECT * FROM giveaway_requests WHERE status = 'waiting' AND expires_at > now()",
  );
  return rows;
}

export async function listExpiredWaitingRequests() {
  const { rows } = await pool.query(
    "SELECT * FROM giveaway_requests WHERE status = 'waiting' AND expires_at <= now()",
  );
  return rows;
}

export async function markGiveawayFulfilled(id: number): Promise<void> {
  await pool.query("UPDATE giveaway_requests SET status = 'fulfilled' WHERE id = $1", [id]);
}

export async function markGiveawayExpired(id: number): Promise<void> {
  await pool.query("UPDATE giveaway_requests SET status = 'expired' WHERE id = $1", [id]);
}
