/**
 * Brand-styled RainbowKit connect control.
 *
 * ConnectButton.Custom gives us the modal plumbing (wallet list, account
 * sheet, chain switching) while we keep full control of the markup so it
 * matches the cream/ink/lime system instead of RainbowKit's default chrome.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";

import { cn } from "@/lib/utils";

export function WalletButton({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        // `mounted` guards against rendering connected state during hydration.
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-cream",
                      "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px] hover:shadow-ink/60",
                      className,
                    )}
                  >
                    Connect wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-5 py-2.5",
                      "text-sm font-bold text-destructive transition-colors hover:bg-destructive/20",
                      className,
                    )}
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={openAccountModal}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-ink/15 bg-lime/25 px-4 py-2",
                    "font-mono text-[0.8rem] font-semibold text-ink transition-colors hover:bg-lime/40",
                    className,
                  )}
                >
                  <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
