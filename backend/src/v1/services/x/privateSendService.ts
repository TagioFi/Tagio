import { encodeFunctionData, parseUnits, parseEther } from "viem";
import { pool } from "../../../db/pool";
import { config } from "../../../config";
import { getPublicClient } from "../onchain/client";
import { privateSendPoolAbi } from "../onchain/privateSendPoolAbi";
import { generateSecret, computeCommitment } from "../../lib/privateSendSecret";
import { quoteSwap } from "../../lib/uniswapV3";
import { buildApprovalIfNeeded, type UnsignedTx } from "../../lib/swapExecution";
import type { BotToken } from "./commandParser";

const USDG_DECIMALS = 6;

function tokenAddress(token: BotToken): `0x${string}` {
  return token === "native" ? "0x0000000000000000000000000000000000000000" : config.robinhood.usdgAddress;
}

function decimalsFor(token: BotToken): number {
  return token === "native" ? 18 : USDG_DECIMALS;
}

// Confirmed 2026-07-20: the keeper fee is always native ETH -- see
// PrivateSendPool.sol's own doc comment for why (a USDG-denominated fee
// can't refill an ETH gas float). Pinned formula, publicly stated the same
// way the bullpost-airdrop engagement formula was:
//
//   keeperFeeWei = (0.1% of the send's value, in ETH) + (live gas price * gasEstimate)
//
// The percentage covers TagioPay's margin/service charge; the gas term is
// what actually keeps the keeper solvent regardless of how gas prices move.
// gasEstimate is a fixed, conservative unit count -- Foundry's gas report
// for `claim()` tops out at 100488 units across every code path this
// contract has (native/token, self/keeper); 150000 leaves ~50% headroom
// without needing a live eth_estimateGas round trip for every send.
const CLAIM_GAS_ESTIMATE = 150_000n;
const KEEPER_FEE_BPS = 10n; // 0.1% = 10 basis points

async function computeKeeperFeeWei(amount: string, token: BotToken): Promise<bigint> {
  const client = getPublicClient();
  const gasPrice = await client.getGasPrice();
  const gasFeeWei = gasPrice * CLAIM_GAS_ESTIMATE;

  if (token === "native") {
    const amountWei = parseEther(amount);
    return (amountWei * KEEPER_FEE_BPS) / 10_000n + gasFeeWei;
  }

  // USDG send -- 0.1% of the send's own value, quoted in ETH terms (not a
  // flat guess), so the fee tracks real USDG/ETH price rather than going
  // stale as either moves. Quoting just the fee-sized slice (not the full
  // send) keeps this accurate even for large sends, where quoting the whole
  // amount would eat meaningfully more price impact than the ~0.1% slice
  // being valued actually deserves.
  const feePortionUsdg = parseFloat(amount) * (Number(KEEPER_FEE_BPS) / 10_000);
  const quote = feePortionUsdg > 0 ? await quoteSwap("USDG", "ETH", feePortionUsdg) : null;
  const percentageFeeWei = quote ? quote.amountOutWei : 0n;
  return percentageFeeWei + gasFeeWei;
}

export interface PreparedPrivateSend {
  commitment: `0x${string}`;
  secret: `0x${string}`;
  approvals: UnsignedTx[];
  send: UnsignedTx;
  amountBaseUnits: string;
  keeperFeeBaseUnits: string;
}

// Builds the sender's unsigned send()/sendToken() call. The secret is
// generated here and returned so the caller can persist it (private_sends
// row) *before* the sender ever signs -- the commitment baked into this
// transaction's calldata is the only on-chain trace of this allocation, and
// it reveals nothing about who recipientWallet is.
export async function preparePrivateSend(
  senderWallet: `0x${string}`,
  recipientWallet: `0x${string}`,
  amount: string,
  token: BotToken,
): Promise<PreparedPrivateSend> {
  const secret = generateSecret();
  const commitment = computeCommitment(secret, recipientWallet);
  const decimals = decimalsFor(token);
  const amountBaseUnits = parseUnits(amount, decimals);
  const keeperFeeWei = await computeKeeperFeeWei(amount, token);

  if (token === "native") {
    const data = encodeFunctionData({
      abi: privateSendPoolAbi,
      functionName: "send",
      args: [commitment, amountBaseUnits, keeperFeeWei],
    });
    return {
      commitment,
      secret,
      approvals: [],
      send: {
        to: config.robinhood.privateSendPoolAddress,
        data,
        value: (amountBaseUnits + keeperFeeWei).toString(),
        chainId: config.robinhood.chainId,
      },
      amountBaseUnits: amountBaseUnits.toString(),
      keeperFeeBaseUnits: keeperFeeWei.toString(),
    };
  }

  // ERC-20 send: `amount` (the USDG token itself) needs an allowance, same
  // as every other approval flow in this codebase; `keeperFeeWei` is ETH,
  // paid directly as msg.value alongside the approval-gated transferFrom --
  // two different assets moving in the same call, not one combined
  // approval the way the old same-token-fee design needed.
  const client = getPublicClient();
  const approval = await buildApprovalIfNeeded(
    client,
    config.robinhood.usdgAddress,
    senderWallet,
    config.robinhood.privateSendPoolAddress,
    amountBaseUnits,
  );
  const data = encodeFunctionData({
    abi: privateSendPoolAbi,
    functionName: "sendToken",
    args: [commitment, tokenAddress(token), amountBaseUnits, keeperFeeWei],
  });
  return {
    commitment,
    secret,
    approvals: approval ? [approval] : [],
    send: {
      to: config.robinhood.privateSendPoolAddress,
      data,
      value: keeperFeeWei.toString(),
      chainId: config.robinhood.chainId,
    },
    amountBaseUnits: amountBaseUnits.toString(),
    keeperFeeBaseUnits: keeperFeeWei.toString(),
  };
}

export function buildUnsignedClaim(commitment: `0x${string}`, recipientWallet: `0x${string}`, secret: `0x${string}`): UnsignedTx {
  const data = encodeFunctionData({
    abi: privateSendPoolAbi,
    functionName: "claim",
    args: [commitment, recipientWallet, secret],
  });
  return { to: config.robinhood.privateSendPoolAddress, data, value: "0", chainId: config.robinhood.chainId };
}

export interface PrivateSendRow {
  id: number;
  pending_transaction_id: number | null;
  commitment: string;
  secret: string;
  sender_wallet: string;
  sender_x_user_id: string;
  recipient_wallet: string;
  // Only set for an @handle recipient -- a #hashtag or raw wallet address
  // resolves to a concrete wallet with no X account involved at all.
  recipient_x_user_id: string | null;
  token: BotToken;
  amount: string;
  amount_base_units: string;
  keeper_fee_base_units: string;
  status: "pending_send" | "sent" | "claimed" | "failed";
  sent_tx_hash: string | null;
  claimed_tx_hash: string | null;
  claimed_by: "keeper" | "self" | null;
  keeper_attempts: number;
  keeper_last_error: string | null;
  created_at: string;
  claimed_at: string | null;
}

export interface CreatePrivateSendRowInput {
  commitment: `0x${string}`;
  secret: `0x${string}`;
  senderWallet: `0x${string}`;
  senderXUserId: string;
  recipientWallet: `0x${string}`;
  recipientXUserId: string | null;
  token: BotToken;
  amount: string;
  amountBaseUnits: string;
  keeperFeeBaseUnits: string;
}

export async function createPrivateSendRow(input: CreatePrivateSendRowInput): Promise<PrivateSendRow> {
  const { rows } = await pool.query(
    `INSERT INTO private_sends
       (commitment, secret, sender_wallet, sender_x_user_id, recipient_wallet, recipient_x_user_id,
        token, amount, amount_base_units, keeper_fee_base_units)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.commitment,
      input.secret,
      input.senderWallet,
      input.senderXUserId,
      input.recipientWallet,
      input.recipientXUserId,
      input.token,
      input.amount,
      input.amountBaseUnits,
      input.keeperFeeBaseUnits,
    ],
  );
  return rows[0];
}

export async function linkPendingTransaction(privateSendId: number, pendingTransactionId: number): Promise<void> {
  await pool.query("UPDATE private_sends SET pending_transaction_id = $2 WHERE id = $1", [
    privateSendId,
    pendingTransactionId,
  ]);
}

// Called once the sender's send()/sendToken() call actually broadcasts
// successfully (routes/pendingTransactions.ts) -- only from here on is this
// allocation real enough for the keeper to attempt claiming.
export async function markPrivateSendSent(commitment: string, txHash: string): Promise<void> {
  await pool.query(
    "UPDATE private_sends SET status = 'sent', sent_tx_hash = $2 WHERE commitment = $1 AND status = 'pending_send'",
    [commitment, txHash],
  );
}

export async function markPrivateSendClaimed(
  commitment: string,
  txHash: string,
  claimedBy: "keeper" | "self",
): Promise<void> {
  await pool.query(
    "UPDATE private_sends SET status = 'claimed', claimed_tx_hash = $2, claimed_by = $3, claimed_at = now() WHERE commitment = $1",
    [commitment, txHash, claimedBy],
  );
}

export async function findPrivateSendByCommitment(commitment: string): Promise<PrivateSendRow | null> {
  const { rows } = await pool.query("SELECT * FROM private_sends WHERE commitment = $1", [commitment]);
  return rows.length === 0 ? null : rows[0];
}

export async function findPrivateSendById(id: number): Promise<PrivateSendRow | null> {
  const { rows } = await pool.query("SELECT * FROM private_sends WHERE id = $1", [id]);
  return rows.length === 0 ? null : rows[0];
}

// The manual $claim fallback resolves the recipient's oldest still-claimable
// send -- oldest first so a recipient with several pending sends clears them
// in the order they arrived, same FIFO intuition as any other claim queue.
export async function findClaimableForRecipient(recipientXUserId: string): Promise<PrivateSendRow | null> {
  const { rows } = await pool.query(
    "SELECT * FROM private_sends WHERE recipient_x_user_id = $1 AND status = 'sent' ORDER BY created_at ASC LIMIT 1",
    [recipientXUserId],
  );
  return rows.length === 0 ? null : rows[0];
}

// The keeper's own poll target -- every 'sent' row across every recipient.
export async function listClaimableForKeeper(): Promise<PrivateSendRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM private_sends WHERE status = 'sent' AND keeper_attempts < 5 ORDER BY created_at ASC",
  );
  return rows;
}

export async function recordKeeperAttemptFailure(id: number, error: string): Promise<void> {
  await pool.query(
    "UPDATE private_sends SET keeper_attempts = keeper_attempts + 1, keeper_last_error = $2 WHERE id = $1",
    [id, error.slice(0, 500)],
  );
}

// Case-insensitive on both sides: the wallet param here comes straight from
// the connected wallet's checksummed (mixed-case) address, while
// sender_wallet/recipient_wallet were written from the JWT/x_accounts flow,
// which normalizes to lowercase -- an exact-match comparison would silently
// return zero rows on that mismatch instead of erroring, which is exactly
// what made this look like "no history" rather than a real bug.
export async function listPrivateSendsForWallet(wallet: string): Promise<PrivateSendRow[]> {
  const { rows } = await pool.query(
    "SELECT * FROM private_sends WHERE LOWER(sender_wallet) = LOWER($1) OR LOWER(recipient_wallet) = LOWER($1) ORDER BY created_at DESC",
    [wallet],
  );
  return rows;
}
