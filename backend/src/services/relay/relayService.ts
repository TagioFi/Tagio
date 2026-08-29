/**
 * Relay.link Cross-Chain Intent & Execution Service
 * Bridges Solana (origin, SOL/USDC) to Robinhood Chain (destination, smart contracts).
 *
 * Implements a strict 0.15% (15 bps) protocol fee on all cross-chain calls.
 */
import { config } from "../../config";

export const SOLANA_CHAIN_ID = 792703809;
export const ROBINHOOD_CHAIN_ID = 13746; // Robinhood Nitro L2 (Arbitrum stack)
export const PROTOCOL_FEE_BPS = 15; // 0.15%

export const SOL_MINT = "11111111111111111111111111111111";
export const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface RelayTxCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
}

export interface GetQuoteParams {
  user: string; // Solana base58 wallet address
  originCurrency: string; // SOL or USDC mint
  destinationCurrency?: string; // e.g. 0x0000... (ETH) or USDG
  amount: string; // base units (lamports for SOL, 6 decimals for USDC)
  recipient?: string; // destination recipient if direct payment
  txs?: RelayTxCall[]; // contract calldata calls to execute on Robinhood
  feeRecipient?: string;
}

export interface RelayStepItem {
  id: string;
  action: string;
  description: string;
  status: "incomplete" | "complete";
  kind: "transaction" | "signature";
  items: Array<{
    status: string;
    data: {
      instructions?: any[];
      addressLookupTableAddresses?: string[];
      from?: string;
      to?: string;
      data?: string;
      value?: string;
      chainId?: number;
    };
    check?: {
      endpoint: string;
      method: string;
    };
  }>;
  requestId?: string;
}

export interface RelayQuoteResponse {
  requestId: string;
  steps: RelayStepItem[];
  fees: {
    gas: any;
    relayer: any;
    relayerService: any;
    app: any;
  };
  details: {
    operation: string;
    sender: string;
    recipient: string;
    currencyIn: any;
    currencyOut: any;
    timeEstimate: number;
  };
}

export async function fetchRelayQuote(params: GetQuoteParams): Promise<RelayQuoteResponse> {
  const body = {
    user: params.user,
    originChainId: SOLANA_CHAIN_ID,
    destinationChainId: ROBINHOOD_CHAIN_ID,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency || "0x0000000000000000000000000000000000000000",
    amount: params.amount,
    recipient: params.recipient,
    txs: params.txs,
    tradeType: "EXACT_INPUT",
    appFees: params.feeRecipient
      ? [
          {
            recipient: params.feeRecipient,
            bps: PROTOCOL_FEE_BPS,
          },
        ]
      : undefined,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.relay.apiKey) {
    headers["x-api-key"] = config.relay.apiKey;
  }

  const res = await fetch("https://api.relay.link/quote/v2", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Relay quote failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as RelayQuoteResponse;
}

export async function getRelayIntentStatus(requestId: string) {
  const headers: Record<string, string> = {};
  if (config.relay.apiKey) {
    headers["x-api-key"] = config.relay.apiKey;
  }

  const res = await fetch(`https://api.relay.link/intents/status/v2?requestId=${encodeURIComponent(requestId)}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch intent status: ${res.statusText}`);
  }
  return await res.json();
}
