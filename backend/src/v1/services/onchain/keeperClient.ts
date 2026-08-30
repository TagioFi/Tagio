import { createWalletClient, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../config";

// The first client in this codebase that signs AND broadcasts real
// transactions on the backend's own behalf, rather than just off-chain
// attestations (compare claimAttestation.ts's attestor, which only ever
// signs a message). Lazily constructed, same reasoning as getPublicClient:
// importing this module shouldn't require KEEPER_PRIVATE_KEY to be set yet.
let _keeperClient: WalletClient | undefined;

export function getKeeperClient(): WalletClient {
  if (!_keeperClient) {
    if (!config.keeper.privateKey) {
      throw new Error("KEEPER_PRIVATE_KEY is not configured");
    }
    if (!config.robinhood.rpcUrl) {
      throw new Error("ROBINHOOD_RPC_URL is not configured");
    }
    _keeperClient = createWalletClient({
      account: privateKeyToAccount(config.keeper.privateKey as `0x${string}`),
      chain: {
        id: config.robinhood.chainId,
        name: "Robinhood Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [config.robinhood.rpcUrl] } },
      },
      transport: http(config.robinhood.rpcUrl),
    });
  }
  return _keeperClient;
}

export function getKeeperAddress(): `0x${string}` {
  return privateKeyToAccount(config.keeper.privateKey as `0x${string}`).address;
}
