/**
 * Thin wrapper over wagmi's account state.
 *
 * Connection itself is driven by RainbowKit's modal (see <WalletButton />), so
 * this hook only reports state. It keeps the shape the pages already consume.
 */

import { useAccount, useWalletClient } from "wagmi";

import { robinhoodChain } from "@/lib/wagmi";

export function useWallet() {
  const { address, isConnected, isConnecting, isReconnecting, status, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  // With `ssr: true` wagmi rehydrates the persisted address *before* the
  // connector finishes its handshake, so `isConnected` is still false while
  // `address` is already set. RainbowKit paints its connected pill off the
  // address, so pages must agree or the nav contradicts the page body.
  const hasAccount = Boolean(address);

  return {
    address: address ?? null,
    isConnected: isConnected || hasAccount,
    isConnecting: isConnecting || isReconnecting,
    /** True while restoring a previous session and no address is known yet. */
    isRestoring: (isConnecting || isReconnecting) && !hasAccount,
    status,
    /** True when connected but pointed at some other chain. */
    isWrongNetwork: hasAccount && chainId !== robinhoodChain.id,
    chainId,
    walletClient: walletClient ?? null,
  };
}
