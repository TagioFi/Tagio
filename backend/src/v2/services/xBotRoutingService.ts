import { isAddress } from "viem";
import { getHandleDetails, V2HandleDetails } from "./handleService";
import { quotePortfolioSettlement, PortfolioSettlementQuoteResult } from "./relaySwapService";
import { resolveV2Token, USDG, ETH, V2TokenInfo } from "../lib/robinhoodTokens";

export interface BotRoutingPlan {
  recipientType: "raw_wallet" | "tagio_handle" | "unregistered_x";
  recipientTarget: string;
  recipientWallet: string;
  inputToken: V2TokenInfo;
  inputAmount: number;
  isDirectTransfer: boolean;
  portfolioSettlement?: PortfolioSettlementQuoteResult;
  directTransferPayload?: {
    to: string;
    token: V2TokenInfo;
    amount: number;
  };
}

export async function routeBotPaymentIntent(params: {
  senderWallet: string;
  recipientInput: string; // e.g. "#alex", "@alex", or "0x123..."
  amount: number;
  tokenSymbolOrAddress: string; // e.g. "USDG", "ETH"
}): Promise<BotRoutingPlan> {
  const token = resolveV2Token(params.tokenSymbolOrAddress) || USDG;
  const target = params.recipientInput.trim();

  // 1. Raw EVM address check
  if (isAddress(target)) {
    return {
      recipientType: "raw_wallet",
      recipientTarget: target,
      recipientWallet: target,
      inputToken: token,
      inputAmount: params.amount,
      isDirectTransfer: true,
      directTransferPayload: {
        to: target,
        token,
        amount: params.amount,
      },
    };
  }

  // 2. Tagio handle / hashtag check
  const handleClean = target.replace(/^#|^@/, "").toLowerCase();
  const handleDetails = await getHandleDetails(handleClean);

  if (handleDetails) {
    const portfolioQuote = await quotePortfolioSettlement({
      userWallet: params.senderWallet,
      recipientWallet: handleDetails.ownerWallet,
      recipientHandle: handleDetails.handle,
      fromToken: token,
      totalAmountIn: params.amount,
      elections: handleDetails.elections.map((e) => ({
        symbol: e.symbol,
        tokenAddress: e.tokenAddress,
        basisPoints: e.basisPoints,
        percentage: e.percentage,
        token: e.token || resolveV2Token(e.symbol) || USDG,
      })),
    });

    return {
      recipientType: "tagio_handle",
      recipientTarget: `#${handleDetails.handle}`,
      recipientWallet: handleDetails.ownerWallet,
      inputToken: token,
      inputAmount: params.amount,
      isDirectTransfer: false,
      portfolioSettlement: portfolioQuote,
    };
  }

  // 3. Fallback for unlinked X handle
  return {
    recipientType: "unregistered_x",
    recipientTarget: target,
    recipientWallet: "0x0000000000000000000000000000000000000000",
    inputToken: token,
    inputAmount: params.amount,
    isDirectTransfer: true,
    directTransferPayload: {
      to: "0x0000000000000000000000000000000000000000",
      token,
      amount: params.amount,
    },
  };
}
