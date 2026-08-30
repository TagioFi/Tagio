import { pool } from "../../../db/pool";
import { config } from "../../../config";
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
  // 'x_bot' (default) for a live mention/DM command; 'giveaway' | 'airdrop' |
  // 'direct-send' when this row was created by claiming a past
  // unclaimed_allocations row (see unclaimedAllocationService.ts) -- lets
  // the dashboard show a "unlocked from a past X" badge on those.
  source?: string;
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
       unsigned_to, unsigned_data, unsigned_value, tweet_url, source
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      input.source ?? "x_bot",
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

export interface CreatePendingDisperseInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  token: BotToken;
  totalAmount: string; // human-readable decimal string, sum across every recipient
  totalAmountBaseUnits: string;
  recipientCount: number;
  approvals: UnsignedTx[];
  primary: UnsignedTx; // first step to sign
  // Remaining steps after `primary`, signed in order -- e.g. one ClaimEscrow
  // deposit per unlinked winner when a giveaway/airdrop pays a mix of linked
  // and unlinked recipients (buildGiveawayPayout in txBuilder.ts). Empty for
  // a plain all-linked disperse.
  extraSteps: UnsignedTx[];
  source: "giveaway" | "airdrop";
  tweetUrl?: string;
}

// Giveaway/airdrop batch payout row (Wave 1's BatchDisperser, extended by
// ClaimEscrow for unlinked winners) -- kind='disperse', target_type='disperse',
// target_value holds the recipient count as a display string since a
// disperse has no single destination the way a payment/swap does.
export async function createPendingDisperse(
  input: CreatePendingDisperseInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals, extra_steps, source
     ) VALUES ($1, $2, $3, 'disperse', $4, $1, $5, $6, $7, $8, $9, $10, $11, 'disperse', $12, $13, $14)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      `${input.recipientCount} recipients`,
      input.token,
      input.totalAmount,
      input.totalAmountBaseUnits,
      input.primary.to,
      input.primary.data,
      input.primary.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
      JSON.stringify(input.extraSteps),
      input.source,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingDepositInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  targetXUserId: string; // recipient's real X user id -- used to compute the escrow hash
  targetXHandle: string; // for display
  token: BotToken;
  amount: string;
  amountBaseUnits: string;
  approvals: UnsignedTx[];
  deposit: UnsignedTx;
  tweetUrl?: string;
}

// A send to an X account that hasn't linked a TagioPay wallet yet --
// kind='deposit', target_type='deposit'. The sender's own wallet signs a
// real ClaimEscrow deposit (see txBuilder.ts's buildUnsignedDeposit), not
// just a database record with nothing backing it. The corresponding
// unclaimed_allocations row is only created once this actually broadcasts
// successfully (see routes/pendingTransactions.ts), so an allocation never
// exists without real escrowed funds behind it.
export async function createPendingDeposit(
  input: CreatePendingDepositInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet, target_x_user_id,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals
     ) VALUES ($1, $2, $3, 'deposit', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'deposit', $14)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      input.targetXHandle,
      config.robinhood.claimEscrowAddress,
      input.targetXUserId,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.deposit.to,
      input.deposit.data,
      input.deposit.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingClaimInput {
  walletAddress: string; // the wallet that just linked -- both requester and recipient here
  xUserId: string;
  token: BotToken;
  amount: string; // human-readable decimal string, informational only (real amount is whatever's on-chain at claim time)
  claim: UnsignedTx;
}

// Sweeps a newly-linked wallet's ClaimEscrow balance -- kind='claim',
// target_type='claim'. sourceRef is deliberately per (xUserId, token) pair,
// not per individual allocation row, since the on-chain claim always sweeps
// the *entire* aggregate balance for that hash regardless of how many
// separate deposits contributed to it.
export async function createPendingClaim(
  input: CreatePendingClaimInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet, target_x_user_id,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value,
       kind
     ) VALUES ($1, $2, $3, 'claim', $1, $1, $2, $4, $5, '0', $6, $7, $8, 'claim')
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.walletAddress,
      input.xUserId,
      `claim-${input.token}-${input.xUserId}`,
      input.token,
      input.amount,
      input.claim.to,
      input.claim.data,
      input.claim.value,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingCauseInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  causeAction: "create" | "donate" | "withdraw";
  causeId: number | null; // null for 'create' -- the id is only assigned once the tx lands onchain
  token: BotToken;
  amount: string;
  amountBaseUnits: string;
  approvals: UnsignedTx[];
  primary: UnsignedTx;
  tweetUrl?: string;
}

// Wave 5 cause actions -- kind='cause', target_type='cause_create' |
// 'cause_donate' | 'cause_withdraw', target_value holds the cause id as a
// display string (or 'new' for a not-yet-created cause).
export async function createPendingCause(input: CreatePendingCauseInput): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals
     ) VALUES ($1, $2, $3, $4, $5, $1, $6, $7, $8, $9, $10, $11, $12, 'cause', $13)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      `cause_${input.causeAction}`,
      input.causeId === null ? "new" : `#CAUSE-${input.causeId}`,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.primary.to,
      input.primary.data,
      input.primary.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingEscrowInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  escrowAction: "create" | "accept" | "deliver" | "release" | "cancel";
  escrowId: number | null; // null for 'create' -- the id is only assigned once the tx lands onchain
  token: BotToken;
  amount: string; // '0' for actions other than create
  amountBaseUnits: string;
  approvals: UnsignedTx[];
  primary: UnsignedTx;
  tweetUrl?: string;
}

// Wave 6 escrow actions -- kind='escrow', target_type='escrow_<action>',
// target_value holds the escrow id as a display string (or 'new').
export async function createPendingEscrow(input: CreatePendingEscrowInput): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals
     ) VALUES ($1, $2, $3, $4, $5, $1, $6, $7, $8, $9, $10, $11, $12, 'escrow', $13)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      `escrow_${input.escrowAction}`,
      input.escrowId === null ? "new" : `#${input.escrowId}`,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.primary.to,
      input.primary.data,
      input.primary.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingPrivateSendInput {
  requestedByWallet: string;
  requestedByXUserId: string;
  sourceRef: string;
  commitment: string; // target_value -- lets the broadcast handler find the matching private_sends row without a new column
  token: BotToken;
  amount: string;
  amountBaseUnits: string;
  approvals: UnsignedTx[];
  send: UnsignedTx;
  tweetUrl?: string;
}

// Wave 7: private send -- kind='psend', target_type='psend_send'. The
// sender's own wallet signs PrivateSendPool.send()/sendToken(), whose
// calldata contains only the opaque commitment, never the recipient's
// address (see privateSendSecret.ts). The corresponding private_sends row
// only flips to status='sent' -- and becomes eligible for the keeper to
// pick up -- once this actually broadcasts successfully (routes/pendingTransactions.ts),
// same "don't book it until it's real" discipline as ClaimEscrow's deposit flow.
export async function createPendingPrivateSend(
  input: CreatePendingPrivateSendInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value, tweet_url,
       kind, approvals
     ) VALUES ($1, $2, $3, 'psend_send', $4, $5, $6, $7, $8, $9, $10, $11, $12, 'psend', $13)
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      input.commitment,
      config.robinhood.privateSendPoolAddress,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.send.to,
      input.send.data,
      input.send.value,
      input.tweetUrl ?? null,
      JSON.stringify(input.approvals),
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

export interface CreatePendingPrivateSendClaimInput {
  requestedByWallet: string; // the recipient, self-claiming
  requestedByXUserId: string;
  sourceRef: string;
  commitment: string;
  token: BotToken;
  amount: string;
  claim: UnsignedTx;
}

// Manual $claim fallback -- kind='psend_claim', target_type='psend_claim'.
// The recipient's own wallet signs, so msg.sender == recipient in the
// contract call and they simply keep the full amount (any keeperFee just
// stays with them too, since there's no separate keeper collecting it).
export async function createPendingPrivateSendClaim(
  input: CreatePendingPrivateSendClaimInput,
): Promise<{ id: number } | null> {
  const { rows } = await pool.query(
    `INSERT INTO pending_transactions (
       requested_by_wallet, requested_by_x_user_id, source_ref,
       target_type, target_value, resolved_to_wallet,
       token, amount, amount_base_units,
       unsigned_to, unsigned_data, unsigned_value,
       kind
     ) VALUES ($1, $2, $3, 'psend_claim', $4, $5, $6, $7, '0', $8, $9, $10, 'psend_claim')
     ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.requestedByWallet,
      input.requestedByXUserId,
      input.sourceRef,
      input.commitment,
      config.robinhood.privateSendPoolAddress,
      input.token,
      input.amount,
      input.claim.to,
      input.claim.data,
      input.claim.value,
    ],
  );
  return rows.length === 0 ? null : { id: rows[0].id };
}

// Case-insensitive on both sides: requested_by_wallet is written from the X-bot/
// dapp flow (often lowercase, e.g. from x_accounts), while walletAddress here comes
// from the connected wallet's checksummed (mixed-case) session -- an exact-match
// comparison would silently return zero rows on that mismatch instead of erroring,
// which looks exactly like "no pending requests" rather than a real bug (confirmed
// live 2026-07-26: jimaizrh's own pending request was invisible on their dashboard
// for exactly this reason).
export async function listPendingForWallet(walletAddress: string) {
  const { rows } = await pool.query(
    `SELECT * FROM pending_transactions
     WHERE LOWER(requested_by_wallet) = LOWER($1) AND status = 'pending'
     ORDER BY created_at DESC`,
    [walletAddress],
  );
  return rows;
}

export async function getPendingTransaction(id: number, walletAddress: string) {
  const { rows } = await pool.query(
    "SELECT * FROM pending_transactions WHERE id = $1 AND LOWER(requested_by_wallet) = LOWER($2)",
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
