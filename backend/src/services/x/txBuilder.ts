import { parseUnits, encodeFunctionData } from "viem";
import { config } from "../../config";
import { getSettlementToken } from "../onchain/client";
import { hashtagResolverAbi } from "../onchain/abi";
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
