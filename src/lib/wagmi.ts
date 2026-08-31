/**
 * wagmi + RainbowKit configuration for Robinhood Chain.
 *
 * WalletConnect-backed wallets (mobile / QR) need a Cloud project id. When
 * VITE_WALLETCONNECT_PROJECT_ID is unset we fall back to an injected-only
 * connector list so browser extensions — including the Rainbow extension —
 * still work in local dev without any account setup.
 */

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  phantomWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { defineChain } from "viem";

/**
 * Canonical mainnet RPC endpoints for chain 4663, per the chainid.network
 * registry entry for "Robinhood Chain" (verified live: both answer
 * eth_chainId with 0x1237 and send `access-control-allow-origin: *`, so the
 * browser can call them directly).
 *
 * NOTE: `https://rpc.chain.robinhood.com/rpc` — the host this used to point at
 * — resolves to CloudFront but has no certificate for that name, so every
 * browser request died in the TLS handshake with
 * ERR_SSL_VERSION_OR_CIPHER_MISMATCH. The mainnet host is `rpc.mainnet.…`.
 */
const DEFAULT_RPC_URLS = [
  "https://rpc.mainnet.chain.robinhood.com",
  "https://robinhood-rpc.publicnode.com",
] as const;

/** Blockscout mainnet instance. `explorer.mainnet.chain.robinhood.com` 301s here. */
const DEFAULT_EXPLORER_URL = "https://robinhoodchain.blockscout.com";

const rpcOverride = (import.meta.env["VITE_ROBINHOOD_RPC_URL"] as string | undefined)?.trim();
const explorerOverride = (
  import.meta.env["VITE_ROBINHOOD_EXPLORER_URL"] as string | undefined
)?.trim();

/** An override takes over entirely; otherwise both public endpoints are used. */
const rpcUrls: readonly string[] = rpcOverride ? [rpcOverride] : DEFAULT_RPC_URLS;
const explorerUrl = (explorerOverride || DEFAULT_EXPLORER_URL).replace(/\/+$/, "");

/** Robinhood Chain — Arbitrum L2, ETH gas token. 4663 == 0x1237. */
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [...rpcUrls] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: explorerUrl },
  },
});

/** Single source of truth for explorer deep links (see `txUrl` / `addressUrl`). */
export const robinhoodExplorerUrl = explorerUrl;

export function explorerTxUrl(txHash: string): string {
  return `${explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${explorerUrl}/address/${address}`;
}

const projectId = (import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"] as string | undefined) ?? "";
const hasProjectId = projectId.length > 0;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: hasProjectId
        ? [rainbowWallet, metaMaskWallet, phantomWallet, walletConnectWallet]
        : [rainbowWallet, metaMaskWallet, phantomWallet, injectedWallet],
    },
  ],
  {
    appName: "TagioFi",
    // RainbowKit requires a non-empty string; without a real id the WalletConnect
    // transport is simply never reached because those wallets aren't listed.
    projectId: hasProjectId ? projectId : "tagiofi-local-dev",
  },
);

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors,
  transports: {
    // `fallback` rotates to the next endpoint on a transport-level failure, so
    // one RPC going down degrades instead of blanking every balance read. The
    // retry budget is deliberately small: viem's default of 3 turns a dead host
    // into a console flood without ever producing a usable answer.
    [robinhoodChain.id]: fallback(
      rpcUrls.map((url) => http(url, { batch: true, retryCount: 1, timeout: 10_000 })),
      { rank: false },
    ),
  },
  // Required for TanStack Start: prevents connector state from being read
  // during the server render.
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
