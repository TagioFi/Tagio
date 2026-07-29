import { encodeFunctionData, parseEventLogs, parseUnits, type TransactionReceipt } from "viem";
import { config } from "../../config";
import { getPublicClient } from "../onchain/client";
import { simpleEscrowAbi, ESCROW_STATUS } from "../onchain/simpleEscrowAbi";
import { buildApprovalIfNeeded, type UnsignedTx } from "../../lib/swapExecution";
import type { BotToken } from "./commandParser";

const USDG_DECIMALS = 6;

function tokenAddress(token: BotToken): `0x${string}` {
  return token === "native" ? "0x0000000000000000000000000000000000000000" : config.robinhood.usdgAddress;
}

function decimalsFor(token: BotToken): number {
  return token === "native" ? 18 : USDG_DECIMALS;
}

export interface EscrowDetails {
  creator: `0x${string}`;
  counterparty: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  description: string;
  status: (typeof ESCROW_STATUS)[number];
  deliverDeadline: bigint;
  releaseDeadline: bigint;
  proofUrl: string;
}

export async function getEscrowDetails(escrowId: number): Promise<EscrowDetails> {
  const raw = (await getPublicClient().readContract({
    address: config.robinhood.simpleEscrowAddress,
    abi: simpleEscrowAbi,
    functionName: "getEscrow",
    args: [BigInt(escrowId)],
  })) as {
    creator: `0x${string}`;
    counterparty: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
    description: string;
    status: number;
    deliverDeadline: bigint;
    releaseDeadline: bigint;
    proofUrl: string;
  };
  return { ...raw, status: ESCROW_STATUS[raw.status]! };
}

export interface EscrowSummary extends EscrowDetails {
  escrowId: number;
}

// No enumerable "escrows for wallet" view on-chain (escrowCount() only gives
// a total, not which ids involve a given address) -- same event-scan
// approach as causeService.listCauses, scanning EscrowCreated twice (once
// per indexed side) since a wallet can appear as either creator or
// counterparty and the two are separate indexed topics.
export async function listEscrowsForWallet(wallet: `0x${string}`): Promise<EscrowSummary[]> {
  const client = getPublicClient();
  const [asCreator, asCounterparty] = await Promise.all([
    client.getContractEvents({
      address: config.robinhood.simpleEscrowAddress,
      abi: simpleEscrowAbi,
      eventName: "EscrowCreated",
      args: { creator: wallet },
      fromBlock: 0n,
      toBlock: "latest",
    }),
    client.getContractEvents({
      address: config.robinhood.simpleEscrowAddress,
      abi: simpleEscrowAbi,
      eventName: "EscrowCreated",
      args: { counterparty: wallet },
      fromBlock: 0n,
      toBlock: "latest",
    }),
  ]);
  const escrowIds = [
    ...new Set(
      [...asCreator, ...asCounterparty].map((log) => log.args.escrowId).filter((id): id is bigint => id !== undefined),
    ),
  ];
  const summaries = await Promise.all(
    escrowIds.map(async (escrowId) => {
      const details = await getEscrowDetails(Number(escrowId));
      return { escrowId: Number(escrowId), ...details };
    }),
  );
  return summaries.sort((a, b) => b.escrowId - a.escrowId); // newest first
}

export interface UnsignedEscrowCreate {
  approvals: UnsignedTx[];
  create: UnsignedTx;
}

export async function buildUnsignedCreateEscrow(
  creatorWallet: `0x${string}`,
  counterparty: `0x${string}`,
  amount: string,
  token: BotToken,
  description: string,
): Promise<UnsignedEscrowCreate> {
  const decimals = decimalsFor(token);
  const amountBaseUnits = parseUnits(amount, decimals);

  if (token === "native") {
    const data = encodeFunctionData({
      abi: simpleEscrowAbi,
      functionName: "create",
      args: [counterparty, amountBaseUnits, tokenAddress(token), description],
    });
    return {
      approvals: [],
      create: { to: config.robinhood.simpleEscrowAddress, data, value: amountBaseUnits.toString(), chainId: config.robinhood.chainId },
    };
  }

  const client = getPublicClient();
  const approval = await buildApprovalIfNeeded(
    client,
    config.robinhood.usdgAddress,
    creatorWallet,
    config.robinhood.simpleEscrowAddress,
    amountBaseUnits,
  );
  const data = encodeFunctionData({
    abi: simpleEscrowAbi,
    functionName: "create",
    args: [counterparty, amountBaseUnits, tokenAddress(token), description],
  });
  return {
    approvals: approval ? [approval] : [],
    create: { to: config.robinhood.simpleEscrowAddress, data, value: "0", chainId: config.robinhood.chainId },
  };
}

function buildSimpleCall(functionName: "accept" | "cancelBeforeAccept" | "release" | "forceRelease" | "refundAfterDeliverDeadline", escrowId: number): UnsignedTx {
  const data = encodeFunctionData({ abi: simpleEscrowAbi, functionName, args: [BigInt(escrowId)] });
  return { to: config.robinhood.simpleEscrowAddress, data, value: "0", chainId: config.robinhood.chainId };
}

export const buildUnsignedAccept = (escrowId: number) => buildSimpleCall("accept", escrowId);
export const buildUnsignedCancelBeforeAccept = (escrowId: number) => buildSimpleCall("cancelBeforeAccept", escrowId);
export const buildUnsignedRelease = (escrowId: number) => buildSimpleCall("release", escrowId);
export const buildUnsignedForceRelease = (escrowId: number) => buildSimpleCall("forceRelease", escrowId);
export const buildUnsignedRefundAfterDeliverDeadline = (escrowId: number) => buildSimpleCall("refundAfterDeliverDeadline", escrowId);

export function buildUnsignedDeliver(escrowId: number, proofUrl: string): UnsignedTx {
  const data = encodeFunctionData({ abi: simpleEscrowAbi, functionName: "deliver", args: [BigInt(escrowId), proofUrl] });
  return { to: config.robinhood.simpleEscrowAddress, data, value: "0", chainId: config.robinhood.chainId };
}

// The create tx's own receipt already has this event on it (no separate
// on-chain read needed) -- used right after confirmation to announce the
// real escrow id, since it doesn't exist until the tx is mined.
export function decodeEscrowEvents(receipt: TransactionReceipt) {
  return parseEventLogs({ abi: simpleEscrowAbi, logs: receipt.logs });
}
