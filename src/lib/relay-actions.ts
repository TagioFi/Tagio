/**
 * Relay.link intent layer — the "Settled on Robinhood" half of the spec.
 *
 * Each action here encodes a Robinhood Chain contract call with viem, hands the
 * calldata to `POST /relay/quote` (which attaches the 0.15% app fee), then signs
 * the Solana instructions Relay returns and polls the intent to settlement.
 * This is spec section 5's blueprint, wired end to end.
 *
 * ── An important constraint, verified against the contracts ──────────────────
 * Relay executes `txs` from its own solver multicaller, so on the Robinhood side
 * `msg.sender` is the solver, never the user's wallet. That is fine for calls
 * that only move value or name their beneficiary explicitly, and wrong for calls
 * that read `msg.sender` to decide ownership:
 *
 *   Relay-safe        renewSubscription (contract comment: "Callable by anyone"),
 *                     receivePayment, transferViaRecoveryPhrase (authorizes on
 *                     the phrase and takes newOwner as an argument),
 *                     ClaimEscrow.deposit*, CauseRegistry.donate,
 *                     PrivateSendPool.send
 *
 *   Sender-bound      registerHashtag (mints to msg.sender — over Relay the NFT
 *                     would land on the solver), updatePayouts / updateMetadata
 *                     (onlyHashtagOwner — would revert NotOwner), the whole
 *                     SimpleEscrow lifecycle, CauseRegistry.withdraw
 *
 * Only the first group is exposed here. The sender-bound calls keep running
 * against the user's own Robinhood wallet in resolver-actions.ts, because
 * routing them through Relay would silently assign ownership to the solver.
 * `assertRelaySafe` makes that boundary a runtime error rather than a comment
 * someone can drift past.
 */
import { encodeFunctionData, keccak256, stringToBytes, zeroAddress } from "viem";
import type { Connection } from "@solana/web3.js";

import {
  CAUSE_REGISTRY_ADDRESS,
  CLAIM_ESCROW_ADDRESS,
  PRIVATE_SEND_POOL_ADDRESS,
  PROTOCOL_FEE_BPS,
  RELAY_SAFE_CALLS,
  RESOLVER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  USDG_ADDRESS,
  causeRegistryAbi,
  claimEscrowAbi,
  currencyInfo,
  privateSendPoolAbi,
  resolverAbi,
} from "./chain";
import { getRelayQuote, normalizeHashtag } from "./tagio";
import {
  executeRelayQuote,
  toBaseUnits,
  waitForRelayIntent,
  type RelayIntentState,
  type RelayQuoteLike,
  type SolanaSigner,
} from "./solana-exec";

export interface RelayTx {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
}

function assertRelaySafe(functionName: string) {
  if (!(RELAY_SAFE_CALLS as readonly string[]).includes(functionName)) {
    throw new Error(
      `"${functionName}" reads msg.sender for ownership and cannot run over a Relay ` +
        `intent — the solver, not your wallet, would be recorded as the owner.`,
    );
  }
}

/** Quotes an intent, signs its Solana side, and follows it to settlement. */
export interface RelayRunResult {
  requestId: string;
  signatures: string[];
  state: RelayIntentState;
  quote: RelayQuoteLike;
}

export interface RelayRunOptions {
  connection: Connection;
  wallet: SolanaSigner;
  /** Which working currency the user is spending — SOL or USDC. */
  currency: string;
  /** Human-entered amount in that currency (e.g. "0.25"). */
  amount: string;
  txs: RelayTx[];
  /** Progress copy for the UI while each wallet prompt is in flight. */
  onProgress?: (message: string) => void;
}

export async function runRelayIntent(options: RelayRunOptions): Promise<RelayRunResult> {
  const { connection, wallet, currency, amount, txs, onProgress } = options;
  if (!wallet.publicKey) throw new Error("Connect a Solana wallet first");

  const info = currencyInfo(currency);
  const baseUnits = toBaseUnits(amount, info.decimals);
  if (baseUnits <= 0n) throw new Error("Amount must be greater than zero");

  onProgress?.("Fetching a Relay quote…");
  const quote = (await getRelayQuote({
    data: {
      user: wallet.publicKey.toBase58(),
      originCurrency: info.mint,
      amount: baseUnits.toString(),
      txs,
    },
  })) as RelayQuoteLike;

  if (!quote?.requestId) {
    throw new Error("Relay didn't return a routable quote for this action");
  }

  const signatures = await executeRelayQuote(connection, wallet, quote, onProgress);

  onProgress?.("Settling on Robinhood Chain…");
  const state = await waitForRelayIntent(quote.requestId);

  return { requestId: quote.requestId, signatures, state, quote };
}

/**
 * Prices the Robinhood leg of a payable call.
 *
 * A call like `receivePayment` or `donate` needs a msg.value denominated in
 * destination-chain ETH, but the user enters an amount in SOL or USDC — so the
 * value can't be encoded until the bridge has been priced. This quotes the
 * plain bridge first (no txs) purely to read `currencyOut`, and returns that
 * amount in base units for the caller to encode into the real intent.
 *
 * The two quotes are moments apart, so the executed value can drift slightly
 * from this figure; Relay's own slippage tolerance on the fill absorbs that,
 * and the caller shows this number as an estimate rather than a promise.
 */
export async function quoteRobinhoodValue(args: {
  user: string;
  currency: string;
  amount: string;
}): Promise<{ valueWei: string; formatted: string }> {
  const info = currencyInfo(args.currency);
  const baseUnits = toBaseUnits(args.amount, info.decimals);

  const quote = (await getRelayQuote({
    data: {
      user: args.user,
      originCurrency: info.mint,
      amount: baseUnits.toString(),
      destinationChainId: ROBINHOOD_CHAIN_ID,
      destinationCurrency: zeroAddress,
    },
  })) as { details?: { currencyOut?: { amount?: string; amountFormatted?: string } } };

  const valueWei = quote?.details?.currencyOut?.amount;
  if (!valueWei) {
    throw new Error("Relay couldn't price this route to Robinhood Chain right now");
  }
  return { valueWei, formatted: quote.details?.currencyOut?.amountFormatted ?? "" };
}

/** Turns a terminal intent state into copy that doesn't overstate the outcome. */
export function describeIntentState(state: RelayIntentState, action: string): string {
  switch (state) {
    case "success":
      return `${action} settled on Robinhood Chain`;
    case "refund":
      return `${action} couldn't be filled — Relay refunded your funds`;
    case "failure":
      return `${action} failed on Robinhood Chain`;
    default:
      return `${action} is still settling — it'll land shortly`;
  }
}

/* ------------------------------------------------------------------ */
/* encoders                                                            */
/* ------------------------------------------------------------------ */

const encode = <T extends readonly unknown[]>(
  abi: T,
  functionName: string,
  args: readonly unknown[],
  to: `0x${string}`,
  value = "0",
): RelayTx => {
  assertRelaySafe(functionName);
  return {
    to,
    // viem's generic inference over these const ABIs is stricter than this
    // helper's shape; the ABI/name/args triples are all checked at each call
    // site below, where they're written literally.
    data: encodeFunctionData({ abi, functionName, args } as never),
    value,
  };
};

/** Spec matrix row 3 — pay a #handle, fanning out through its onchain splits. */
export const encodePayHashtag = (hashtag: string, valueWei: string): RelayTx =>
  encode(resolverAbi, "receivePayment", [normalizeHashtag(hashtag)], RESOLVER_ADDRESS, valueWei);

/** Spec matrix row 4 — extend a 30-day lease. Callable by anyone, per the contract. */
export const encodeRenewHashtag = (hashtag: string, feeWei: string): RelayTx =>
  encode(resolverAbi, "renewSubscription", [normalizeHashtag(hashtag)], RESOLVER_ADDRESS, feeWei);

/** Spec Module 3 — restore a handle to a new wallet using the recovery phrase. */
export const encodeRecoverHashtag = (
  hashtag: string,
  recoveryPhrase: string,
  newOwner: `0x${string}`,
): RelayTx =>
  encode(
    resolverAbi,
    "transferViaRecoveryPhrase",
    [normalizeHashtag(hashtag), recoveryPhrase.trim(), newOwner],
    RESOLVER_ADDRESS,
  );

/** Spec matrix row 5 — deposit to an unlinked @handle until they connect X. */
export function encodeClaimEscrowDeposit(args: {
  xUserId: string;
  token: "native" | "usdg";
  amountWei: string;
}): RelayTx {
  const xUserIdHash = keccak256(stringToBytes(args.xUserId));
  if (args.token === "native") {
    return encode(
      claimEscrowAbi,
      "depositNative",
      [xUserIdHash],
      CLAIM_ESCROW_ADDRESS,
      args.amountWei,
    );
  }
  return encode(
    claimEscrowAbi,
    "depositToken",
    [xUserIdHash, USDG_ADDRESS, BigInt(args.amountWei)],
    CLAIM_ESCROW_ADDRESS,
  );
}

/** Spec matrix row 8 — donate to a cause. */
export function encodeDonateToCause(args: {
  causeId: number;
  token: "native" | "usdg";
  amountWei: string;
}): RelayTx {
  return encode(
    causeRegistryAbi,
    "donate",
    [BigInt(args.causeId), BigInt(args.amountWei)],
    CAUSE_REGISTRY_ADDRESS,
    args.token === "native" ? args.amountWei : "0",
  );
}

/** Spec matrix row 9 — lock funds into the shielded pool for the keeper to sweep. */
export function encodePrivateSend(args: {
  commitment: `0x${string}`;
  amountWei: string;
  keeperFeeWei: string;
  token: "native" | "usdg";
}): RelayTx {
  // keeperFee is always native ETH (see PrivateSendPool.sol), so a native send
  // has to carry both the amount and the fee as msg.value.
  const value =
    args.token === "native"
      ? (BigInt(args.amountWei) + BigInt(args.keeperFeeWei)).toString()
      : args.keeperFeeWei;

  return encode(
    privateSendPoolAbi,
    "send",
    [args.commitment, BigInt(args.amountWei), BigInt(args.keeperFeeWei)],
    PRIVATE_SEND_POOL_ADDRESS,
    value,
  );
}

/* ------------------------------------------------------------------ */
/* fee preview (spec Module 6 — "0.15% protocol fee breakdown")         */
/* ------------------------------------------------------------------ */

export interface RoutePreview {
  /** Which execution path the matrix in spec section 3 assigns to this action. */
  path: "solana" | "relay";
  feeBps: number;
  feeAmount: string;
  netAmount: string;
  etaSeconds: number;
}

export function previewRoute(path: "solana" | "relay", amount: string): RoutePreview {
  const value = Number(amount) || 0;
  const feeBps = path === "relay" ? PROTOCOL_FEE_BPS : 0;
  const fee = (value * feeBps) / 10_000;
  return {
    path,
    feeBps,
    feeAmount: fee.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0",
    netAmount: (value - fee).toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0",
    // Direct Solana transfers confirm in about a slot; a Relay intent adds the
    // solver's fill on the destination chain.
    etaSeconds: path === "relay" ? 12 : 2,
  };
}

/* ------------------------------------------------------------------ */
/* error copy                                                          */
/* ------------------------------------------------------------------ */

const SOLANA_ERROR_HINTS: Array<[RegExp, string]> = [
  [/user rejected|rejected the request|declined/i, "Transaction rejected in wallet"],
  [/insufficient (lamports|funds)/i, "Not enough balance to cover the amount plus network fees"],
  [
    /blockhash not found|block height exceeded/i,
    "The transaction expired before it landed — try again",
  ],
  [/0x1771|slippage/i, "Price moved past your slippage tolerance — re-quote and try again"],
  [/WalletNotConnected/i, "Connect a Solana wallet first"],
];

/** Solana/Relay counterpart to resolver-actions' EVM `friendlyError`. */
export function friendlySolanaError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  for (const [pattern, copy] of SOLANA_ERROR_HINTS) {
    if (pattern.test(message)) return copy;
  }
  return message || "Something went wrong — try again";
}

export const NATIVE_TOKEN_ADDRESS = zeroAddress;
