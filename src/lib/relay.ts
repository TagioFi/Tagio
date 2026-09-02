/**
 * Executes the transaction steps returned inside a Relay quote.
 *
 * A quote leg carries `quote.steps[].items[].data` — an already-encoded
 * transaction request. We forward each incomplete item to the wallet in order.
 * The shape is intentionally loosely typed: the backend passes Relay's payload
 * through unchanged, so we validate defensively rather than mirroring its
 * full schema.
 */

import type { WalletClient } from "viem";

import type { PortfolioSettlementQuoteResult } from "@/types/tagio-v2";

interface RelayTxData {
  to?: string;
  data?: string;
  value?: string | number;
  gas?: string | number;
  from?: string;
}

interface RelayStepItem {
  status?: string;
  data?: RelayTxData;
}

interface RelayStep {
  id?: string;
  action?: string;
  items?: RelayStepItem[];
}

function toBigInt(value: string | number | undefined): bigint | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

/** Flattens every pending transaction item across all legs, in leg order. */
export function collectSettlementSteps(quote: PortfolioSettlementQuoteResult): RelayTxData[] {
  const txs: RelayTxData[] = [];

  for (const leg of quote.legs) {
    const steps = (leg.quote?.steps ?? []) as RelayStep[];
    for (const step of steps) {
      for (const item of step.items ?? []) {
        // Only skip items that are already completed/satisfied
        if (item.status === "complete" || item.status === "success") continue;
        if (item.data?.to) txs.push(item.data);
      }
    }
  }

  return txs;
}

export interface SettlementProgress {
  index: number;
  total: number;
  hash: string;
}

/**
 * Sends each step sequentially through the connected wallet client. Returns
 * every hash produced; the last one is reported to /v2/settle/confirm.
 */
export async function executeSettlement(
  walletClient: WalletClient,
  quote: PortfolioSettlementQuoteResult,
  onProgress?: (progress: SettlementProgress) => void,
): Promise<string[]> {
  const txs = collectSettlementSteps(quote);
  if (txs.length === 0) {
    throw new Error("This quote carried no executable steps. Refresh and try again.");
  }

  const account = walletClient.account;
  if (!account) throw new Error("Wallet client has no account attached.");

  const hashes: string[] = [];

  for (const [index, tx] of txs.entries()) {
    const value = toBigInt(tx.value);
    const gas = toBigInt(tx.gas);

    const hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: tx.to as `0x${string}`,
      ...(tx.data ? { data: tx.data as `0x${string}` } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(gas !== undefined ? { gas } : {}),
    });

    hashes.push(hash);
    onProgress?.({ index: index + 1, total: txs.length, hash });
  }

  return hashes;
}
