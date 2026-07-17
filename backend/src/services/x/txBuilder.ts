import { parseUnits, encodeFunctionData } from "viem";
import { config } from "../../config";
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
