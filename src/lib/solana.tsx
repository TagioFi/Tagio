import { FC, ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "../styles/wallet-modal.css";

export const SOLANA_RPC_ENDPOINT = clusterApiUrl("mainnet-beta");

export const SolanaAppWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => SOLANA_RPC_ENDPOINT, []);

  // Left empty on purpose. WalletProvider runs the list through
  // useStandardWalletAdapters, which appends every Wallet Standard wallet the
  // browser has registered -- Phantom, Solflare, Backpack, Jupiter and anything
  // else the visitor actually has installed -- and adds the mobile adapter on
  // mobile. Only a wallet that does NOT implement Wallet Standard would need
  // its adapter listed here explicitly.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
