import { createPublicClient, http, parseEventLogs, type Hash, type TransactionReceipt } from "viem";
import { config } from "../../config";
import { hashtagResolverAbi } from "./abi";

let _publicClient: ReturnType<typeof createPublicClient> | undefined;

// Lazily constructed so importing this module doesn't require ROBINHOOD_RPC_URL
// to be set yet (e.g. during local scaffolding, typecheck, or unit tests).
function getPublicClient() {
  if (!_publicClient) {
    if (!config.robinhood.rpcUrl) {
      throw new Error("ROBINHOOD_RPC_URL is not configured");
    }
    _publicClient = createPublicClient({
      chain: {
        id: config.robinhood.chainId,
        name: "Robinhood Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [config.robinhood.rpcUrl] } },
      },
      transport: http(config.robinhood.rpcUrl),
    });
  }
  return _publicClient;
}

export async function getAccount(hashtag: string) {
  return getPublicClient().readContract({
    address: config.robinhood.resolverAddress,
    abi: hashtagResolverAbi,
    functionName: "getAccount",
    args: [hashtag],
  });
}

export async function isActive(hashtag: string): Promise<boolean> {
  return getPublicClient().readContract({
    address: config.robinhood.resolverAddress,
    abi: hashtagResolverAbi,
    functionName: "isActive",
    args: [hashtag],
  });
}

export async function isRegistered(hashtag: string): Promise<boolean> {
  return getPublicClient().readContract({
    address: config.robinhood.resolverAddress,
    abi: hashtagResolverAbi,
    functionName: "isValidHashtag",
    args: [hashtag],
  });
}

export async function getTransactionReceipt(txHash: Hash): Promise<TransactionReceipt> {
  return getPublicClient().getTransactionReceipt({ hash: txHash });
}

export function decodeResolverEvents(receipt: TransactionReceipt) {
  return parseEventLogs({
    abi: hashtagResolverAbi,
    logs: receipt.logs,
  });
}
