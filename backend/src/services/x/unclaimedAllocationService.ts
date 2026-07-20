import { pool } from "../../db/pool";
import type { BotToken } from "./commandParser";
import { buildUnsignedClaim } from "./txBuilder";
import { createPendingClaim } from "./pendingTransactionService";
import { log } from "../../lib/logger";

export type AllocationSource = "giveaway" | "airdrop" | "direct-send";

export interface CreateUnclaimedAllocationInput {
  xUserId: string;
  xHandle: string;
  token: BotToken;
  amount: string;
  amountBaseUnits: string;
  source: AllocationSource;
  // A giveaway/airdrop event allocates to many winners under the same
  // sourceRef -- idempotency is per (sourceRef, xUserId), not per sourceRef
  // alone, so re-processing the same event doesn't drop the second winner.
  sourceRef?: string;
}

// Only ever called once the real deposit into ClaimEscrow has actually
// broadcast successfully (see routes/pendingTransactions.ts) -- this row is
// a record of an escrowed entitlement, not a promise with nothing behind
// it. Returns null if this exact (sourceRef, xUserId) pair was already
// recorded.
export async function createUnclaimedAllocation(
  input: CreateUnclaimedAllocationInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO unclaimed_allocations
       (x_user_id, x_handle, token, amount, amount_base_units, source, source_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (source_ref, x_user_id) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.xUserId,
      input.xHandle,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.source,
      input.sourceRef ?? null,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export async function listUnclaimedForXUser(xUserId: string) {
  const { rows } = await pool.query(
    "SELECT * FROM unclaimed_allocations WHERE x_user_id = $1 AND status = 'unclaimed'",
    [xUserId],
  );
  return rows;
}

// Called when a kind='claim' pending_transactions row for (xUserId, token)
// broadcasts successfully -- the on-chain claim sweeps the *entire*
// aggregate ClaimEscrow balance for that hash, so every still-unclaimed row
// for this (xUserId, token) pair is now genuinely settled, regardless of
// how many separate deposits contributed to it.
export async function markAllocationsClaimed(xUserId: string, token: BotToken): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE unclaimed_allocations SET status = 'claimed' WHERE x_user_id = $1 AND token = $2 AND status = 'unclaimed'",
    [xUserId, token],
  );
  return rowCount ?? 0;
}

// Daily sweep, same startPollLoop pattern already used for mentions/DMs
// (see index.ts) -- no external API involved, so it never hits that loop's
// 402/429 backoff branch, just the generic error-log one.
export async function sweepExpiredAllocations(): Promise<void> {
  const { rowCount } = await pool.query(
    "UPDATE unclaimed_allocations SET status = 'expired' WHERE status = 'unclaimed' AND expires_at < now()",
  );
  if (rowCount) log.info("unclaimed_allocations_expired", { count: rowCount });
}

// Called right after a wallet links its X account (routes/xAuthCallback.ts).
// Builds one kind='claim' pending_transactions row per distinct token owed
// (not one per allocation row -- ClaimEscrow's balance is a single running
// total per hash+token, so one claimNative/claimToken call sweeps
// everything regardless of how many sends/giveaways/airdrops contributed
// to it). The wallet that just linked signs and pays gas for the claim,
// same as any other pending-transaction sign-off. Allocation rows are only
// marked 'claimed' once that claim actually broadcasts successfully (see
// markAllocationsClaimed, called from routes/pendingTransactions.ts) --
// not here, since creating the pending row doesn't mean it'll ever be
// signed.
export async function claimAllocationsForXUser(
  xUserId: string,
  walletAddress: `0x${string}`,
): Promise<number> {
  const allocations = await listUnclaimedForXUser(xUserId);
  if (allocations.length === 0) return 0;

  const tokens = [...new Set(allocations.map((a) => a.token as BotToken))];
  let created = 0;
  for (const token of tokens) {
    const totalAmount = allocations
      .filter((a) => a.token === token)
      .reduce((sum, a) => sum + parseFloat(a.amount), 0)
      .toString();
    const claimTx = await buildUnsignedClaim(token, xUserId, walletAddress);
    const row = await createPendingClaim({
      walletAddress,
      xUserId,
      token,
      amount: totalAmount,
      claim: claimTx,
    });
    if (row) created++;
  }
  if (created) log.info("unclaimed_allocations_claim_offered", { xUserId, walletAddress, tokenCount: created });
  return created;
}
