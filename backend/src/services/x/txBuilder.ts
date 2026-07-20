import { parseUnits, encodeFunctionData } from "viem";
import { config } from "../../config";
import { getSettlementToken, getPublicClient } from "../onchain/client";
import { hashtagResolverAbi } from "../onchain/abi";
import { batchDisperserAbi } from "../onchain/batchDisperserAbi";
import { claimEscrowAbi } from "../onchain/claimEscrowAbi";
import { buildApprovalIfNeeded, type UnsignedTx } from "../../lib/swapExecution";
import { xUserIdHash, signClaimAttestation } from "../../lib/claimAttestation";
import type { BotToken } from "./commandParser";

// Confirmed onchain (0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168): name "Global
// Dollar", symbol "USDG", decimals 6 -- do not assume 18 like most ERC-20s.
const USDG_DECIMALS = 6;

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface UnsignedTransfer {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string; // wei, decimal string
  amountBaseUnits: string;
}

// Shared by buildUnsignedTransfer below and unclaimedAllocationService.ts --
// the latter needs an allocation's base-units amount before any wallet is
// known to send to, so it can't go through buildUnsignedTransfer itself.
export function amountToBaseUnits(token: BotToken, amount: string): string {
  return parseUnits(amount, token === "native" ? 18 : USDG_DECIMALS).toString();
}

// Plain wallet-to-wallet transfer -- correct for `wallet` and `x_account` targets,
// where there's no hashtag/payout-split concept to respect.
export function buildUnsignedTransfer(token: BotToken, toWallet: `0x${string}`, amount: string): UnsignedTransfer {
  if (token === "native") {
    const value = parseUnits(amount, 18);
    return { to: toWallet, data: "0x", value: value.toString(), amountBaseUnits: value.toString() };
  }

  const amountBaseUnits = parseUnits(amount, USDG_DECIMALS);
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [toWallet, amountBaseUnits],
  });
  return { to: config.robinhood.usdgAddress, data, value: "0", amountBaseUnits: amountBaseUnits.toString() };
}

// Routes through the resolver's receivePayment/receiveTokenPayment instead of a
// plain transfer, so a bot-initiated "send X to #hashtag" respects that hashtag's
// payout splits exactly like a dapp-initiated payment does -- same hashtag, same
// behavior, regardless of which path was used to pay it.
//
// Returns null when the combination can't be routed through the resolver today:
// receiveTokenPayment only accepts whatever ERC-20 is currently the contract's
// configured `settlementToken` (and requires the payer to have pre-approved the
// resolver for that token, which the current one-step sign-off flow doesn't yet
// support) -- so a token that isn't the live settlementToken has no split-honoring
// path yet. Native ETH has no such restriction; receivePayment always works.
export async function buildUnsignedHashtagPayment(
  token: BotToken,
  hashtag: string,
  amount: string,
): Promise<UnsignedTransfer | null> {
  if (token === "native") {
    const value = parseUnits(amount, 18);
    const data = encodeFunctionData({
      abi: hashtagResolverAbi,
      functionName: "receivePayment",
      args: [hashtag],
    });
    return { to: config.robinhood.resolverAddress, data, value: value.toString(), amountBaseUnits: value.toString() };
  }

  const currentSettlementToken = await getSettlementToken();
  if (currentSettlementToken.toLowerCase() !== config.robinhood.usdgAddress.toLowerCase()) {
    return null;
  }

  const amountBaseUnits = parseUnits(amount, USDG_DECIMALS);
  const data = encodeFunctionData({
    abi: hashtagResolverAbi,
    functionName: "receiveTokenPayment",
    args: [hashtag, amountBaseUnits],
  });
  return { to: config.robinhood.resolverAddress, data, value: "0", amountBaseUnits: amountBaseUnits.toString() };
}

export interface DisperseRecipient {
  wallet: `0x${string}`;
  amount: string; // human-readable decimal string, this recipient's own share
}

export interface UnsignedDisperse {
  approvals: UnsignedTx[]; // empty for native -- ERC20 needs an approve first the same way a swap does
  disperse: UnsignedTx;
  totalAmount: string; // human-readable decimal string, sum of every recipient's amount
  totalAmountBaseUnits: string;
}

// Giveaway/airdrop payout builder (Wave 1's BatchDisperser) -- pays every
// winner/holder from one signature instead of one UnsignedTransfer each.
// The requester's own wallet signs and pays gas, same as any other
// pending-transaction sign-off; this never sponsors gas or holds funds
// itself beyond the single atomic disperse transaction.
export async function buildUnsignedDisperse(
  token: BotToken,
  requesterWallet: `0x${string}`,
  recipients: DisperseRecipient[],
): Promise<UnsignedDisperse> {
  const wallets = recipients.map((r) => r.wallet);
  const amountsBaseUnits = recipients.map((r) => BigInt(amountToBaseUnits(token, r.amount)));
  const total = amountsBaseUnits.reduce((sum, a) => sum + a, 0n);

  if (token === "native") {
    const data = encodeFunctionData({
      abi: batchDisperserAbi,
      functionName: "disperseNative",
      args: [wallets, amountsBaseUnits],
    });
    return {
      approvals: [],
      disperse: { to: config.robinhood.batchDisperserAddress, data, value: total.toString(), chainId: config.robinhood.chainId },
      totalAmount: recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0).toString(),
      totalAmountBaseUnits: total.toString(),
    };
  }

  const client = getPublicClient();
  const approval = await buildApprovalIfNeeded(
    client,
    config.robinhood.usdgAddress,
    requesterWallet,
    config.robinhood.batchDisperserAddress,
    total,
  );
  const data = encodeFunctionData({
    abi: batchDisperserAbi,
    functionName: "disperseToken",
    args: [config.robinhood.usdgAddress, wallets, amountsBaseUnits],
  });
  return {
    approvals: approval ? [approval] : [],
    disperse: { to: config.robinhood.batchDisperserAddress, data, value: "0", chainId: config.robinhood.chainId },
    totalAmount: recipients.reduce((sum, r) => sum + parseFloat(r.amount), 0).toString(),
    totalAmountBaseUnits: total.toString(),
  };
}

export interface UnsignedDeposit {
  approvals: UnsignedTx[]; // empty for native -- ERC20 needs an approve first, same as everywhere else
  deposit: UnsignedTx;
  amountBaseUnits: string;
}

// A payment targeting an X account that hasn't linked a TagioPay wallet yet
// can't be a plain transfer -- there's no destination address. This deposits
// into ClaimEscrow instead, tagged by a hash of the recipient's X user id,
// so the SENDER's funds are actually escrowed the moment they sign (not
// just recorded as a database IOU with nothing backing it -- see
// unclaimedAllocationService.ts for the corresponding claim side).
export async function buildUnsignedDeposit(
  token: BotToken,
  senderWallet: `0x${string}`,
  xUserId: string,
  amount: string,
): Promise<UnsignedDeposit> {
  const hash = xUserIdHash(xUserId);

  if (token === "native") {
    const value = parseUnits(amount, 18);
    const data = encodeFunctionData({ abi: claimEscrowAbi, functionName: "depositNative", args: [hash] });
    return {
      approvals: [],
      deposit: { to: config.robinhood.claimEscrowAddress, data, value: value.toString(), chainId: config.robinhood.chainId },
      amountBaseUnits: value.toString(),
    };
  }

  const amountBaseUnits = parseUnits(amount, USDG_DECIMALS);
  const client = getPublicClient();
  const approval = await buildApprovalIfNeeded(
    client,
    config.robinhood.usdgAddress,
    senderWallet,
    config.robinhood.claimEscrowAddress,
    amountBaseUnits,
  );
  const data = encodeFunctionData({
    abi: claimEscrowAbi,
    functionName: "depositToken",
    args: [hash, config.robinhood.usdgAddress, amountBaseUnits],
  });
  return {
    approvals: approval ? [approval] : [],
    deposit: { to: config.robinhood.claimEscrowAddress, data, value: "0", chainId: config.robinhood.chainId },
    amountBaseUnits: amountBaseUnits.toString(),
  };
}

// Sweeps everything owed to xUserId (across however many deposits
// accumulated while they were unlinked) to the wallet that just linked.
// The attestor signature is generated fresh here -- it's cheap (an
// off-chain signature, not a transaction) and there's no reason to cache
// one that's only ever used once.
export async function buildUnsignedClaim(
  token: BotToken,
  xUserId: string,
  claimantWallet: `0x${string}`,
): Promise<UnsignedTx> {
  const hash = xUserIdHash(xUserId);
  const signature = await signClaimAttestation(hash, claimantWallet);

  const data =
    token === "native"
      ? encodeFunctionData({ abi: claimEscrowAbi, functionName: "claimNative", args: [hash, signature] })
      : encodeFunctionData({
          abi: claimEscrowAbi,
          functionName: "claimToken",
          args: [hash, config.robinhood.usdgAddress, signature],
        });

  return { to: config.robinhood.claimEscrowAddress, data, value: "0", chainId: config.robinhood.chainId };
}

export interface GiveawayWinner {
  xUserId: string;
  wallet: `0x${string}` | null; // null means unlinked -- deposit into escrow instead
  amount: string; // this winner's own share, human-readable decimal string
}

export interface GiveawayPayoutPlan {
  approvals: UnsignedTx[];
  primary: UnsignedTx; // first step to sign
  extraSteps: UnsignedTx[]; // remaining steps, signed in this order after primary
  totalAmount: string;
  totalAmountBaseUnits: string;
}

// Giveaway/airdrop winners are a mix of linked wallets (paid via one
// BatchDisperser call) and unlinked X accounts (each needing its own
// ClaimEscrow deposit -- BatchDisperser can only pay concrete addresses, it
// has no notion of "pay this X user once they link"). The requester ends up
// signing more than one transaction when unlinked winners are involved --
// not literally "one signature," but one flow, same sequential-signing
// pattern already used for swap approvals.
export async function buildGiveawayPayout(
  token: BotToken,
  requesterWallet: `0x${string}`,
  winners: GiveawayWinner[],
): Promise<GiveawayPayoutPlan> {
  const linked = winners.filter((w) => w.wallet !== null) as Array<GiveawayWinner & { wallet: `0x${string}` }>;
  const unlinked = winners.filter((w) => w.wallet === null);

  const approvals: UnsignedTx[] = [];
  const steps: UnsignedTx[] = [];

  if (linked.length > 0) {
    const disperse = await buildUnsignedDisperse(
      token,
      requesterWallet,
      linked.map((w) => ({ wallet: w.wallet, amount: w.amount })),
    );
    approvals.push(...disperse.approvals);
    steps.push(disperse.disperse);
  }

  if (unlinked.length > 0) {
    // One combined approval covers every unlinked winner's deposit -- each
    // depositToken call draws down the same allowance, so there's no need
    // to approve per-winner (and buildUnsignedDeposit's own per-call
    // allowance check is bypassed below for exactly that reason: checking
    // on-chain allowance at build time would see 0, before this combined
    // approval has even broadcast, and redundantly ask to approve again).
    if (token !== "native") {
      const totalUnlinked = unlinked.reduce((sum, w) => sum + BigInt(amountToBaseUnits(token, w.amount)), 0n);
      const client = getPublicClient();
      const approval = await buildApprovalIfNeeded(
        client,
        config.robinhood.usdgAddress,
        requesterWallet,
        config.robinhood.claimEscrowAddress,
        totalUnlinked,
      );
      if (approval) approvals.push(approval);
    }
    for (const winner of unlinked) {
      const deposit = await buildUnsignedDeposit(token, requesterWallet, winner.xUserId, winner.amount);
      steps.push(deposit.deposit);
    }
  }

  const [primary, ...extraSteps] = steps;
  const totalAmountBaseUnits = winners.reduce((sum, w) => sum + BigInt(amountToBaseUnits(token, w.amount)), 0n);

  return {
    approvals,
    primary: primary!,
    extraSteps,
    totalAmount: winners.reduce((sum, w) => sum + parseFloat(w.amount), 0).toString(),
    totalAmountBaseUnits: totalAmountBaseUnits.toString(),
  };
}
