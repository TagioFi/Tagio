import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useBalance } from "wagmi";
import { robinhoodChain } from "../lib/chain";

const short = (a: string | undefined) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export const formatBalance = (b: { value: bigint; decimals: number } | undefined) =>
  b
    ? Number(formatUnits(b.value, b.decimals)).toLocaleString("en-US", {
        maximumFractionDigits: 5,
      })
    : "—";

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

function ChipBalance({ address }: { address: `0x${string}` }) {
  const { data: balance } = useBalance({ address, chainId: robinhoodChain.id });
  return (
    <div className="bal">
      {formatBalance(balance)} <small>ETH</small>
    </div>
  );
}

/**
 * Wallet connect/disconnect control backed by RainbowKit. `chip` is the dark
 * sidebar variant, `button` a pill button for topbars.
 */
export function WalletControl({ variant = "button" }: { variant?: "button" | "chip" }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;
        const wrongNetwork = connected && chain.unsupported;
        const onClick = !connected
          ? openConnectModal
          : wrongNetwork
            ? openChainModal
            : openAccountModal;

        if (variant === "chip") {
          if (!connected || wrongNetwork) {
            return (
              <button
                className="wallet-chip"
                onClick={onClick}
                disabled={!mounted}
                style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              >
                <div className="addr">
                  {walletIcon}
                  {wrongNetwork ? "Wrong network" : "Connect wallet"}
                </div>
              </button>
            );
          }
          return (
            <div className="wallet-chip">
              <div className="addr">
                {walletIcon}
                {short(account.address)}
                <button
                  onClick={openAccountModal}
                  style={{
                    marginLeft: "auto",
                    fontSize: "0.7rem",
                    color: "rgba(255,255,255,0.55)",
                    textDecoration: "underline",
                  }}
                >
                  manage
                </button>
              </div>
              <ChipBalance address={account.address as `0x${string}`} />
            </div>
          );
        }

        return (
          <button
            className="btn ghost sm"
            onClick={onClick}
            disabled={!mounted}
            title={connected ? "Wallet options" : undefined}
          >
            {!connected
              ? "Connect wallet"
              : wrongNetwork
                ? "Wrong network"
                : short(account.address)}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
