import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const short = (a: string | undefined) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "");

const walletIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M16 12h4" />
  </svg>
);

function SolanaChipBalance() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    let live = true;
    connection.getBalance(publicKey).then((lamports) => {
      if (live) setBalance(lamports / LAMPORTS_PER_SOL);
    }).catch(() => {
      if (live) setBalance(null);
    });
    return () => {
      live = false;
    };
  }, [publicKey, connection]);

  return (
    <div className="bal">
      {balance !== null ? balance.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"} <small>SOL</small>
    </div>
  );
}

/**
 * Wallet connect/disconnect control backed by Solana Wallet Adapter.
 * `chip` is the dark sidebar variant, `button` a pill button for topbars.
 */
export function WalletControl({ variant = "button" }: { variant?: "button" | "chip" }) {
  const { publicKey, connected, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  const handleAction = () => {
    if (!connected) {
      setVisible(true);
    } else {
      disconnect();
    }
  };

  const address = publicKey?.toBase58();

  if (variant === "chip") {
    if (!connected || !address) {
      return (
        <button
          className="wallet-chip"
          onClick={handleAction}
          style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
        >
          <div className="addr">
            {walletIcon}
            {connecting ? "Connecting…" : "Connect Solana"}
          </div>
        </button>
      );
    }

    return (
      <div className="wallet-chip">
        <div className="addr">
          {walletIcon}
          {short(address)}
          <button
            onClick={() => disconnect()}
            style={{
              marginLeft: "auto",
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.55)",
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            disconnect
          </button>
        </div>
        <SolanaChipBalance />
      </div>
    );
  }

  return (
    <button
      className="btn ghost sm"
      onClick={handleAction}
      title={connected ? "Disconnect wallet" : undefined}
    >
      {!connected ? (connecting ? "Connecting…" : "Connect Solana") : short(address)}
    </button>
  );
}
