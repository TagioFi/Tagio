/**
 * Relay.link Cross-Chain & Same-Chain Intent Service
 * Handles Solana-to-Solana swaps (via Jupiter routing) and Solana-to-Robinhood contract execution.
 *
 * Implements an optional 0.15% (15 bps) protocol fee on all Relay quotes.
 */
import { config } from "../../config";

export const SOLANA_CHAIN_ID = 792703809;
export const ROBINHOOD_CHAIN_ID = 13746; // Robinhood Nitro L2
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
  originChainId?: number;
  destinationChainId?: number;
  originCurrency: string; // token mint or 0x address
  // Optional: defaults to the destination chain's native currency, which is
  // what a contract call needs (msg.value in ETH on Robinhood) and what a
  // same-chain Solana route falls back to.
  destinationCurrency?: string; // token mint or 0x address
  amount: string; // base units (e.g. lamports for SOL, 6 decimals for USDC)
  recipient?: string; // destination recipient
  txs?: RelayTxCall[]; // contract calldata calls to execute
  feeRecipient?: string;
  tradeType?: "EXACT_INPUT" | "EXACT_OUTPUT";
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
    totalImpact?: { usd: string; percent: string };
    swapImpact?: { usd: string; percent: string };
    rate?: string;
    timeEstimate: number;
    route?: any;
  };
}

export async function fetchRelayQuote(params: GetQuoteParams): Promise<RelayQuoteResponse> {
  const originChainId = params.originChainId ?? SOLANA_CHAIN_ID;
  const destinationChainId = params.destinationChainId ?? (params.txs ? ROBINHOOD_CHAIN_ID : SOLANA_CHAIN_ID);

  // Native currency of whichever chain we're landing on: SOL's system-program
  // mint on Solana, the zero address on an EVM chain. Sending `undefined` here
  // makes Relay reject the quote outright, so this default matters.
  const nativeDestination =
    destinationChainId === SOLANA_CHAIN_ID ? SOL_MINT : "0x0000000000000000000000000000000000000000";

  const body: Record<string, any> = {
    user: params.user,
    originChainId,
    destinationChainId,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency ?? nativeDestination,
    amount: params.amount,
    recipient: params.recipient || params.user,
    txs: params.txs,
    tradeType: params.tradeType || "EXACT_INPUT",
  };

  if (params.feeRecipient) {
    body.appFees = [
      {
        recipient: params.feeRecipient,
        bps: PROTOCOL_FEE_BPS,
      },
    ];
  }

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
