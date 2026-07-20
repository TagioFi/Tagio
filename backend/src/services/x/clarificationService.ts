import { pool } from "../../db/pool";
import { log } from "../../lib/logger";

// Groq only ever fills one of these slot enums -- it never generates the
// reply text itself. That's the X automation-rules compliance boundary:
// parsing/classifying intent via AI is fine, generating user-facing text is
// not without prior written approval.
export type MissingSlot =
  | "missing_amount"
  | "missing_token"
  | "missing_recipient_count"
  | "ambiguous_target"
  | "missing_requirement_threshold";

export const CLARIFICATION_REPLIES: Record<MissingSlot, string> = {
  missing_amount: "How much should this send/give away in total?",
  missing_token: "Which token -- ETH or USDG?",
  missing_recipient_count: "How many people should this go to?",
  ambiguous_target: "Who should receive this -- a hashtag, wallet, X account, or token holders?",
  missing_requirement_threshold: "What's the minimum -- likes, comments, or retweets -- for this giveaway?",
};

export interface PendingClarification {
  xUserId: string;
  source: "mention" | "dm";
  sourceRef: string;
  partialIntent: Record<string, unknown>;
  missingSlot: MissingSlot;
}

// At most one open clarification per user (see the unique index) -- a new
// one for the same user replaces whatever was open before, and extends the
// 30-minute window fresh from now.
export async function saveClarification(input: PendingClarification): Promise<void> {
  await pool.query(
    `INSERT INTO pending_clarifications (x_user_id, source, source_ref, partial_intent, missing_slot)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (x_user_id) DO UPDATE SET
       source = EXCLUDED.source,
       source_ref = EXCLUDED.source_ref,
       partial_intent = EXCLUDED.partial_intent,
       missing_slot = EXCLUDED.missing_slot,
       created_at = now(),
       expires_at = now() + interval '30 minutes'`,
    [input.xUserId, input.source, input.sourceRef, JSON.stringify(input.partialIntent), input.missingSlot],
  );
}

export async function getOpenClarification(xUserId: string): Promise<PendingClarification | null> {
  const { rows } = await pool.query(
    `SELECT x_user_id, source, source_ref, partial_intent, missing_slot
     FROM pending_clarifications WHERE x_user_id = $1 AND expires_at > now()`,
    [xUserId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    xUserId: row.x_user_id,
    source: row.source,
    sourceRef: row.source_ref,
    partialIntent: row.partial_intent,
    missingSlot: row.missing_slot,
  };
}

export async function clearClarification(xUserId: string): Promise<void> {
  await pool.query("DELETE FROM pending_clarifications WHERE x_user_id = $1", [xUserId]);
}

// No reply sent for anything this sweeps up -- avoids spending a
// reply-write on a conversation the user already walked away from.
export async function sweepExpiredClarifications(): Promise<void> {
  const { rowCount } = await pool.query("DELETE FROM pending_clarifications WHERE expires_at <= now()");
  if (rowCount) log.info("pending_clarifications_expired", { count: rowCount });
}
