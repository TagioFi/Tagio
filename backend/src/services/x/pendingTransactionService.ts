import { pool } from "../../db/pool";
import type { BotToken, BotTargetType } from "./commandParser";
import type { UnsignedTransfer } from "./txBuilder";
import type { UnsignedTx } from "../../lib/swapExecution";

export interface CreatePendingTransactionInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  targetType: BotTargetType;
  targetValue: string;
  resolvedToWallet: string;
  token: BotToken;
  amount: string;
  unsignedTransfer: UnsignedTransfer;
  // Link back to the tweet that prompted this request, so the user can see
  // which of their posts triggered it. Only set for mention-triggered
  // requests -- DMs have no public tweet to point to.
  tweetUrl?: string;
}

// Returns null if this source_ref was already processed (idempotent against
// duplicate polling reads of the same mention/DM).
export async function createPendingTransaction(
  input: CreatePendingTransactionInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      input.targetType,
      input.targetValue,
      input.resolvedToWallet,
      input.token,
      input.amount,
      input.unsignedTransfer.amountBaseUnits,
      input.unsignedTransfer.to,
      input.unsignedTransfer.data,
      input.unsignedTransfer.value,
      input.tweetUrl ?? null,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingSwapInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  fromSymbol: string; // 'ETH' | 'USDG' -- the asset being spent
  toSymbol: string; // the RWA ticker being bought, or 'ETH'/'USDG' when selling one
  amount: string; // human-readable decimal string of fromSymbol
  amountInBaseUnits: string; // fromSymbol's amount in its own base units
  approvals: UnsignedTx[];
  swap: UnsignedTx;
  route: string;
  priceImpactPct: number;
  tweetUrl?: string;
}

// Same idempotency contract as createPendingTransaction -- kind='swap' rows
// live in the same table so the dashboard's single Pending list covers both.
export async function createPendingSwap(
  input: CreatePendingSwapInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals, quote_route, price_impact_pct
     ) VALUES ($1, $2, $3, 'swap', $4, $1, $5, $6, $7, $8, $9, $10, $11, 'swap', $12, $13, $14)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      input.toSymbol,
      input.fromSymbol,
      input.amount,
      input.amountInBaseUnits,
      input.swap.to,
      input.swap.data,
      input.swap.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
      input.route,
      input.priceImpactPct,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export async function listPendingForWallet(walletAddress: string) {
  const { rows } = await pool.query(
    `SELECT * FROM pending_transactions
     WHERE requested_by_wallet = $1 AND status = 'pending'
     ORDER BY created_at DESC`,
    [walletAddress],
  );
  return rows;
}

export async function getPendingTransaction(id: number, walletAddress: string) {
  const { rows } = await pool.query(
    "SELECT * FROM pending_transactions WHERE id = $1 AND requested_by_wallet = $2",
    [id, walletAddress],
  );
  return rows.length === 0 ? null : rows[0];
}

export async function markBroadcast(id: number, txHash: string): Promise<void> {
  await pool.query("UPDATE pending_transactions SET status = 'broadcast', tx_hash = $2 WHERE id = $1", [
    id,
    txHash,
  ]);
}

export async function markCancelled(id: number): Promise<void> {
  await pool.query("UPDATE pending_transactions SET status = 'cancelled' WHERE id = $1", [id]);
}
