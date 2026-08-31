import { config } from "../../config";
import { parseUnits } from "viem";
import {
  ROBINHOOD_CHAIN_ID,
  V2TokenInfo,
  USDG,
  resolveV2Token,
} from "../lib/robinhoodTokens";

export const PROTOCOL_FEE_BPS = 15; // 0.15% (15 bps) app fee

export interface SingleSwapQuoteParams {
  userWallet: string;
  fromToken: V2TokenInfo;
  toToken: V2TokenInfo;
  amountIn: number;
  recipientWallet?: string;
  slippageBps?: number;
}

export interface SingleSwapQuoteResult {
  fromToken: V2TokenInfo;
  toToken: V2TokenInfo;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  rate: string;
  priceImpactPct: number;
  timeEstimate: number;
  requestId?: string;
  steps?: any[];
  rawRelayQuote?: any;
}

export interface PortfolioElectionLeg {
  symbol: string;
  tokenAddress: string;
  basisPoints: number;
  percentage: number;
  token: V2TokenInfo;
}

export interface PortfolioQuoteLegResult {
  assetSymbol: string;
  assetAddress: string;
  basisPoints: number;
  percentage: number;
  allocatedInAmount: string;
  allocatedInAmountFormatted: string;
  quote: SingleSwapQuoteResult;
  isFallbackUsdg?: boolean;
}

export interface PortfolioSettlementQuoteResult {
  recipientHandle?: string | null;
  recipientWallet: string;
  inputToken: V2TokenInfo;
  totalInAmount: string;
  totalInAmountFormatted: string;
  legs: PortfolioQuoteLegResult[];
}

export async function fetchRelayRobinhoodQuote(params: {
  user: string;
  originCurrency: string;
  destinationCurrency: string;
  amount: string;
  recipient?: string;
}): Promise<any> {
  const body: Record<string, any> = {
    user: params.user,
    originChainId: ROBINHOOD_CHAIN_ID,
    destinationChainId: ROBINHOOD_CHAIN_ID,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency,
    amount: params.amount,
    recipient: params.recipient || params.user,
    tradeType: "EXACT_INPUT",
    appFees: [
      {
        recipient: config.robinhood.feeWallet,
        fee: PROTOCOL_FEE_BPS.toString(),
      },
    ],
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
    throw new Error(`Relay Robinhood quote failed (${res.status}): ${errorText}`);
  }

  return await res.json();
}

export async function quoteSingleSwap(params: SingleSwapQuoteParams): Promise<SingleSwapQuoteResult> {
  const inBaseUnits = parseUnits(params.amountIn.toString(), params.fromToken.decimals).toString();

  // If same token, return 1:1 fee-free path
  if (params.fromToken.address.toLowerCase() === params.toToken.address.toLowerCase()) {
    return {
      fromToken: params.fromToken,
      toToken: params.toToken,
      amountIn: inBaseUnits,
      amountInFormatted: params.amountIn.toString(),
      amountOut: inBaseUnits,
      amountOutFormatted: params.amountIn.toString(),
      rate: "1.0",
      priceImpactPct: 0,
      timeEstimate: 0,
    };
  }

  const relayQuote = await fetchRelayRobinhoodQuote({
    user: params.userWallet,
    originCurrency: params.fromToken.address,
    destinationCurrency: params.toToken.address,
    amount: inBaseUnits,
    recipient: params.recipientWallet || params.userWallet,
  });

  const outAmount = relayQuote.details?.currencyOut?.amount || "0";
  const outFormatted = relayQuote.details?.currencyOut?.amountFormatted || "0";
  const priceImpact = parseFloat(relayQuote.details?.totalImpact?.percent || "0");

  return {
    fromToken: params.fromToken,
    toToken: params.toToken,
    amountIn: inBaseUnits,
    amountInFormatted: params.amountIn.toString(),
    amountOut: outAmount,
    amountOutFormatted: outFormatted,
    rate: relayQuote.details?.rate || (parseFloat(outFormatted) / params.amountIn).toFixed(6),
    priceImpactPct: priceImpact,
    timeEstimate: relayQuote.details?.timeEstimate || 2,
    requestId: relayQuote.requestId,
    steps: relayQuote.steps,
    rawRelayQuote: relayQuote,
  };
}

export async function quotePortfolioSettlement(params: {
  userWallet: string;
  recipientWallet: string;
  recipientHandle?: string | null;
  fromToken: V2TokenInfo;
  totalAmountIn: number;
  elections: PortfolioElectionLeg[];
  slippageBps?: number;
}): Promise<PortfolioSettlementQuoteResult> {
  const totalInBaseUnits = parseUnits(params.totalAmountIn.toString(), params.fromToken.decimals).toString();

  // Quote every elected leg concurrently
  const legPromises = params.elections.map(async (election) => {
    const legShare = (params.totalAmountIn * election.basisPoints) / 10000;
    const legInBaseUnits = parseUnits(legShare.toString(), params.fromToken.decimals).toString();

    let legQuote: SingleSwapQuoteResult;
    let isFallbackUsdg = false;

    try {
      legQuote = await quoteSingleSwap({
        userWallet: params.userWallet,
        recipientWallet: params.recipientWallet,
        fromToken: params.fromToken,
        toToken: election.token,
        amountIn: legShare,
        slippageBps: params.slippageBps || 50,
      });

      // Slippage Fallback Guardrail: If leg price impact exceeds 5%, safe-settle into USDG
      if (Math.abs(legQuote.priceImpactPct) > 5.0 && election.token.symbol !== "USDG") {
        isFallbackUsdg = true;
        legQuote = await quoteSingleSwap({
          userWallet: params.userWallet,
          recipientWallet: params.recipientWallet,
          fromToken: params.fromToken,
          toToken: USDG,
          amountIn: legShare,
          slippageBps: 50,
        });
      }
    } catch (err) {
      // If a specific RWA leg fails liquidity on Relay, safe-settle that leg in USDG
      isFallbackUsdg = true;
      legQuote = await quoteSingleSwap({
        userWallet: params.userWallet,
        recipientWallet: params.recipientWallet,
        fromToken: params.fromToken,
        toToken: USDG,
        amountIn: legShare,
        slippageBps: 50,
      });
    }

    return {
      assetSymbol: isFallbackUsdg ? "USDG" : election.symbol,
      assetAddress: isFallbackUsdg ? USDG.address : election.tokenAddress,
      basisPoints: election.basisPoints,
      percentage: election.percentage,
      allocatedInAmount: legInBaseUnits,
      allocatedInAmountFormatted: legShare.toFixed(6),
      quote: legQuote,
      isFallbackUsdg,
    };
  });

  const legs = await Promise.all(legPromises);

  return {
    recipientHandle: params.recipientHandle || null,
    recipientWallet: params.recipientWallet,
    inputToken: params.fromToken,
    totalInAmount: totalInBaseUnits,
    totalInAmountFormatted: params.totalAmountIn.toString(),
    legs,
  };
}
