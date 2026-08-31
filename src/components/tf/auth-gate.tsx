/**
 * The v2 entry gate: **connect wallet → connect X → dashboard**.
 *
 * Both steps are mandatory. Wallet ownership decides which tags you can edit;
 * the X link is what the bot settles against when someone tweets
 * `@TagioPayBot send @you 40 usdg`, so a wallet without one has no dashboard to
 * show. `AuthGate` renders its children only in stage `ready`.
 */

import type { ReactNode } from "react";

import { SpotlightCard } from "@/components/tf/spotlight";
import { WalletButton } from "@/components/tf/wallet-button";
import { useTagioAuth, type AuthStage } from "@/hooks/useTagioAuth";
import { shortAddress } from "@/lib/tagio-api";
import { cn } from "@/lib/utils";

const STEPS: Array<{ id: "wallet" | "x" | "dashboard"; label: string }> = [
  { id: "wallet", label: "Connect wallet" },
  { id: "x", label: "Connect X" },
  { id: "dashboard", label: "Dashboard" },
];

/** How far along the flow each stage is — index of the *current* step. */
function activeIndex(stage: AuthStage): number {
  switch (stage) {
    case "connect-wallet":
    case "restoring":
      return 0;
    case "link-x":
    case "linking":
      return 1;
    case "ready":
      return 2;
  }
}

export function AuthSteps({ stage, className }: { stage: AuthStage; className?: string }) {
  const current = activeIndex(stage);

  return (
    <ol className={cn("flex flex-wrap items-center gap-2", className)}>
      {STEPS.map((step, index) => {
        const done = index < current;
        const isCurrent = index === current;

        return (
          <li key={step.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition-colors",
                done && "border-lime-deep/40 bg-lime/25",
                isCurrent && "border-ink/20 bg-cream/70",
                !done && !isCurrent && "border-ink/10 bg-transparent",
              )}
            >
              <span
                className={cn(
                  "tf-numeric flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold",
                  done && "bg-lime-deep text-cream",
                  isCurrent && "bg-ink text-cream",
                  !done && !isCurrent && "bg-ink/10 text-ink/40",
                )}
                aria-hidden="true"
              >
                {done ? "✓" : index + 1}
              </span>
              <span
                className={cn("text-sm font-bold", done || isCurrent ? "text-ink" : "text-ink/40")}
              >
                {step.label}
              </span>
            </div>

            {index < STEPS.length - 1 ? (
              <span
                className={cn("h-px w-5", done ? "bg-lime-deep/50" : "bg-ink/12")}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Renders `children` once both steps are done; otherwise the step the user is
 * actually on. Pass an already-created auth object when the page needs it too,
 * so the hook's state machine isn't instantiated twice.
 */
export function AuthGate({
  auth,
  children,
}: {
  auth: ReturnType<typeof useTagioAuth>;
  children: ReactNode;
}) {
  const { stage, address, isWrongNetwork, error, connectX } = auth;

  if (stage === "ready") return <>{children}</>;

  return (
    <SpotlightCard className="mt-12 p-10 sm:p-14">
      <AuthSteps stage={stage} className="justify-center" />

      <div className="mt-10 flex flex-col items-center gap-4 text-center">
        {stage === "restoring" ? (
          <>
            <h2 className="text-xl font-bold tracking-[-0.02em] text-ink">
              Reconnecting your wallet…
            </h2>
            <p className="max-w-sm text-sm text-ink/55">
              Restoring the session from your last visit.
            </p>
          </>
        ) : null}

        {stage === "connect-wallet" ? (
          <>
            <h2 className="text-xl font-bold tracking-[-0.02em] text-ink">
              Connect a wallet to start
            </h2>
            <p className="max-w-sm text-sm text-ink/55">
              Tags are owned by an address on Robinhood Chain. Nothing is custodied — connecting
              only proves the address is yours.
            </p>
            <WalletButton />
          </>
        ) : null}

        {stage === "link-x" || stage === "linking" ? (
          <>
            <h2 className="text-xl font-bold tracking-[-0.02em] text-ink">
              Connect X to open your dashboard
            </h2>
            <p className="max-w-sm text-sm text-ink/55">
              {shortAddress(address)} is connected. Sign once to prove you hold it, then authorize X
              so @TagioPayBot can settle payments addressed to your handle.
            </p>

            <button
              type="button"
              onClick={() => void connectX()}
              disabled={stage === "linking"}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream",
                "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-12px] hover:shadow-ink/60",
                "disabled:translate-y-0 disabled:opacity-55 disabled:shadow-none",
              )}
            >
              <XMark className="size-4" />
              {stage === "linking" ? "Check your wallet…" : "Connect X"}
            </button>

            <p className="max-w-sm text-xs text-ink/40">
              We read your handle and user id only. TagioFi never posts on your behalf and never
              holds your funds.
            </p>

            {isWrongNetwork ? (
              <p className="max-w-sm text-xs text-ink/50">
                Your wallet is on another network. Signing still works, but switch to Robinhood
                Chain before settling.
              </p>
            ) : null}

            {error ? <p className="max-w-sm text-sm text-destructive">{error}</p> : null}
          </>
        ) : null}
      </div>
    </SpotlightCard>
  );
}

export function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}
