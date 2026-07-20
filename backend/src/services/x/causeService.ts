import { encodeFunctionData, parseUnits } from "viem";
import { config } from "../../config";
import { getPublicClient } from "../onchain/client";
import { causeRegistryAbi } from "../onchain/causeRegistryAbi";
import { buildApprovalIfNeeded, type UnsignedTx } from "../../lib/swapExecution";
import type { BotToken } from "./commandParser";

// Confirmed onchain: USDG is 6 decimals, native ETH is 18 -- same convention
// used everywhere else in this codebase (txBuilder.ts, swapExecution.ts).
const USDG_DECIMALS = 6;

function tokenAddress(token: BotToken): `0x${string}` {
  return token === "native" ? "0x0000000000000000000000000000000000000000" : config.robinhood.usdgAddress;
}

function decimalsFor(token: BotToken): number {
  return token === "native" ? 18 : USDG_DECIMALS;
}

export interface CauseDetails {
  name: string;
  organizer: `0x${string}`;
  token: `0x${string}`;
  goal: bigint;
  totalRaised: bigint;
  totalWithdrawn: bigint;
}

// "$donate to '<name>'" needs to resolve a free-text name to a causeId --
// there's no on-chain name->id index (would need a mapping keyed on a
// dynamic string, an unnecessary storage cost for something this rarely
// looked up), so this scans CauseCreated events for an exact,
// case-insensitive match instead. Returns null for no match, and also for
// more than one match rather than guessing which cause was meant.
export async function findCauseIdByName(name: string): Promise<number | null> {
  const client = getPublicClient();
  const logs = await client.getContractEvents({
    address: config.robinhood.causeRegistryAddress,
    abi: causeRegistryAbi,
    eventName: "CauseCreated",
    fromBlock: 0n,
    toBlock: "latest",
  });
  const matches = logs.filter((log) => log.args.name?.toLowerCase() === name.toLowerCase());
  if (matches.length !== 1) return null;
  return Number(matches[0]!.args.causeId);
}

export interface CauseSummary extends CauseDetails {
  causeId: number;
}

// Dashboard's Causes list -- same event-scan approach as findCauseIdByName,
// since causeCount() alone gives a count but not which ids are "active"
// (there's no delete/deactivate, so in practice 1..causeCount are all real,
// but reading each one's current state still requires an individual call).
export async function listCauses(): Promise<CauseSummary[]> {
  const client = getPublicClient();
  const logs = await client.getContractEvents({
    address: config.robinhood.causeRegistryAddress,
    abi: causeRegistryAbi,
    eventName: "CauseCreated",
    fromBlock: 0n,
    toBlock: "latest",
  });

  const causeIds = [...new Set(logs.map((log) => log.args.causeId).filter((id): id is bigint => id !== undefined))];
  const summaries = await Promise.all(
    causeIds.map(async (causeId) => {
      const details = await getCauseDetails(Number(causeId));
      return { causeId: Number(causeId), ...details };
    }),
  );
  return summaries.sort((a, b) => b.causeId - a.causeId); // newest first
}

export async function getCauseDetails(causeId: number): Promise<CauseDetails> {
  return getPublicClient().readContract({
    address: config.robinhood.causeRegistryAddress,
    abi: causeRegistryAbi,
    functionName: "getCause",
    args: [BigInt(causeId)],
  }) as Promise<CauseDetails>;
}

export interface LeaderboardEntry {
  donor: `0x${string}`;
  total: bigint;
}

// No enumerable donor list on-chain (an unbounded on-chain array would be a
// gas-griefing vector) -- the distinct donor set comes from indexing
// Donated events, then each donor's authoritative cumulative total is read
// straight from the contract's own donorTotal mapping rather than trusted
// from summed event amounts.
export async function getLeaderboard(causeId: number, topN = 10): Promise<LeaderboardEntry[]> {
  const client = getPublicClient();
  const logs = await client.getContractEvents({
    address: config.robinhood.causeRegistryAddress,
    abi: causeRegistryAbi,
    eventName: "Donated",
    args: { causeId: BigInt(causeId) },
    fromBlock: 0n,
    toBlock: "latest",
  });

  const donors = [...new Set(logs.map((log) => log.args.donor).filter((d): d is `0x${string}` => Boolean(d)))];
  const entries = await Promise.all(
    donors.map(async (donor) => ({
      donor,
      total: await client.readContract({
        address: config.robinhood.causeRegistryAddress,
        abi: causeRegistryAbi,
        functionName: "donorTotal",
        args: [BigInt(causeId), donor],
      }),
    })),
  );

  return entries.sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)).slice(0, topN);
}

export interface UnsignedCauseCreate {
  createCause: UnsignedTx;
}

export function buildUnsignedCreateCause(
  name: string,
  organizer: `0x${string}`,
  goal: string,
  token: BotToken,
): UnsignedCauseCreate {
  const goalBaseUnits = parseUnits(goal, decimalsFor(token));
  const data = encodeFunctionData({
    abi: causeRegistryAbi,
    functionName: "createCause",
    args: [name, organizer, goalBaseUnits, tokenAddress(token)],
  });
  return { createCause: { to: config.robinhood.causeRegistryAddress, data, value: "0", chainId: config.robinhood.chainId } };
}

export interface UnsignedDonation {
  approvals: UnsignedTx[];
  donate: UnsignedTx;
}

export async function buildUnsignedDonate(
  causeId: number,
  donorWallet: `0x${string}`,
  amount: string,
  token: BotToken,
): Promise<UnsignedDonation> {
  const amountBaseUnits = parseUnits(amount, decimalsFor(token));

  if (token === "native") {
    const data = encodeFunctionData({
      abi: causeRegistryAbi,
      functionName: "donate",
      args: [BigInt(causeId), amountBaseUnits],
    });
    return {
      approvals: [],
      donate: { to: config.robinhood.causeRegistryAddress, data, value: amountBaseUnits.toString(), chainId: config.robinhood.chainId },
    };
  }

  const client = getPublicClient();
  const approval = await buildApprovalIfNeeded(
    client,
    config.robinhood.usdgAddress,
    donorWallet,
    config.robinhood.causeRegistryAddress,
    amountBaseUnits,
  );
  const data = encodeFunctionData({
    abi: causeRegistryAbi,
    functionName: "donate",
    args: [BigInt(causeId), amountBaseUnits],
  });
  return {
    approvals: approval ? [approval] : [],
    donate: { to: config.robinhood.causeRegistryAddress, data, value: "0", chainId: config.robinhood.chainId },
  };
}

export function buildUnsignedWithdraw(causeId: number, amount: string, token: BotToken, proofUrl: string): UnsignedTx {
  const amountBaseUnits = parseUnits(amount, decimalsFor(token));
  const data = encodeFunctionData({
    abi: causeRegistryAbi,
    functionName: "withdraw",
    args: [BigInt(causeId), amountBaseUnits, proofUrl],
  });
  return { to: config.robinhood.causeRegistryAddress, data, value: "0", chainId: config.robinhood.chainId };
}
