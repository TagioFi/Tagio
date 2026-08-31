import { config } from "../../config";
import { encodeFunctionData, erc20Abi, parseUnits } from "viem";
import {
  ROBINHOOD_CHAIN_ID,
  V2TokenInfo,
  USDG,
  resolveV2Token,
} from "../lib/robinhoodTokens";
import { planSwap } from "../../lib/swapExecution";
import { quoteSwap } from "../../lib/uniswap";

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
  const recipient = (params.recipientWallet || params.userWallet) as `0x${string}`;

  // 1. Same-Asset Settlement: Generate directly executable transfer step
  if (params.fromToken.address.toLowerCase() === params.toToken.address.toLowerCase()) {
    const isNative = params.fromToken.isNative || params.fromToken.address === "0x0000000000000000000000000000000000000000";
    
    const itemData = isNative
      ? {
          to: recipient,
          data: "0x" as `0x${string}`,
          value: inBaseUnits,
          chainId: ROBINHOOD_CHAIN_ID,
        }
      : {
          to: params.fromToken.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, BigInt(inBaseUnits)],
          }),
          value: "0",
          chainId: ROBINHOOD_CHAIN_ID,
        };

    const steps = [
      {
        id: "transfer",
        action: `Transfer ${params.fromToken.symbol}`,
        description: `Direct transfer of ${params.amountIn} ${params.fromToken.symbol}`,
        kind: "transaction",
        items: [
          {
            status: "not_started",
            data: itemData,
          },
        ],
      },
    ];

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
      steps,
    };
  }

  // 2. Try Relay Cross-Chain / Same-Chain Solver First
  try {
    const relayQuote = await fetchRelayRobinhoodQuote({
      user: params.userWallet,
      originCurrency: params.fromToken.address,
      destinationCurrency: params.toToken.address,
      amount: inBaseUnits,
      recipient,
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
  } catch (relayErr: any) {
    // 3. Fallback to Robinhood Chain Native Uniswap V4 / V3 Router for Stock Tokens
    try {
      const plan = await planSwap(params.fromToken.symbol, params.toToken.symbol, params.amountIn, recipient);
      if (plan) {
        const steps: any[] = [];
        
        // Add token approvals if needed
        if (plan.approvals && plan.approvals.length > 0) {
          steps.push({
            id: "approve",
            action: `Approve ${params.fromToken.symbol}`,
            description: `Approve ${params.fromToken.symbol} for swap execution`,
            kind: "transaction",
            items: plan.approvals.map((tx) => ({
              status: "not_started",
              data: {
                to: tx.to,
                data: tx.data,
                value: tx.value,
                chainId: ROBINHOOD_CHAIN_ID,
              },
            })),
          });
        }

        // Add the swap execution step
        steps.push({
          id: "swap",
          action: `Swap ${params.fromToken.symbol} for ${params.toToken.symbol}`,
          description: `Execute swap via Robinhood Uniswap (${plan.quote.route})`,
          kind: "transaction",
          items: [
            {
              status: "not_started",
              data: {
                to: plan.swap.to,
                data: plan.swap.data,
                value: plan.swap.value,
                chainId: ROBINHOOD_CHAIN_ID,
              },
            },
          ],
        });

        return {
          fromToken: params.fromToken,
          toToken: params.toToken,
          amountIn: inBaseUnits,
          amountInFormatted: params.amountIn.toString(),
          amountOut: plan.quote.amountOutWei.toString(),
          amountOutFormatted: plan.quote.amountOut,
          rate: (parseFloat(plan.quote.amountOut) / params.amountIn).toFixed(6),
          priceImpactPct: plan.quote.priceImpactPct,
          timeEstimate: 2,
          steps,
        };
      }
    } catch (uniswapErr) {
      // Re-throw if both Relay and Uniswap fail
    }

    throw new Error(`Swap route unavailable for ${params.fromToken.symbol} -> ${params.toToken.symbol}: ${relayErr.message}`);
  }
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
      // If a specific RWA leg has no route, safe-settle that leg in USDG
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
