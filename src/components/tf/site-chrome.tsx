/**
 * Shared page chrome: a nav bar that condenses into a floating pill on scroll,
 * and the footer.
 */

import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { TagioMark } from "@/components/tf/brand";
import { XMark } from "@/components/tf/auth-gate";
import { WalletButton } from "@/components/tf/wallet-button";
import { useTagioAuth } from "@/hooks/useTagioAuth";
import { cn } from "@/lib/utils";
import { robinhoodExplorerUrl } from "@/lib/wagmi";

const NAV_LINKS: Array<{ label: string; to: string; hash?: string }> = [
  { label: "Trade", to: "/trade" },
  { label: "How it works", to: "/", hash: "how" },
  { label: "Assets", to: "/", hash: "assets" },
  { label: "Roadmap", to: "/roadmap" },
  { label: "Dashboard", to: "/app" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav
        className={cn(
          "flex w-full max-w-6xl items-center gap-2 rounded-full px-4 py-2.5 transition-all duration-500",
          scrolled
            ? "border border-ink/10 bg-cream/80 shadow-[0_10px_40px_-24px] shadow-ink/40 backdrop-blur-xl"
            : "border border-transparent bg-transparent",
        )}
      >
        <Link to="/" className="flex items-center gap-2.5 pr-2 text-ink">
          <TagioMark className="h-6 w-6" />
          <span className="text-[1.02rem] font-extrabold tracking-[-0.03em]">TagioFi</span>
        </Link>

        <div className="mx-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              {...(link.hash ? { hash: link.hash } : {})}
              className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="/site/docs.html"
            className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Docs
          </a>
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <AuthNav />
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}

/**
 * Tracks the user through connect wallet → connect X → dashboard.
 *
 * With a wallet connected but no X link it points at /app, where the gate runs
 * the X hop; once linked it shows the verified handle and the dashboard link.
 * Hidden on /app itself, and the X-handle pill is dropped on small screens.
 * `stage` is "restoring" until mount, which is what keeps the server-rendered
 * (signed-out) markup from mismatching during hydration.
 */
function AuthNav() {
  const { stage, xHandle } = useTagioAuth();
  const routerState = useRouterState();
  const onDashboard = routerState.location.pathname.startsWith("/app");

  if (stage === "restoring" || stage === "connect-wallet") return null;

  if (stage !== "ready") {
    return onDashboard ? null : (
      <Link
        to="/app"
        className={cn(
          "hidden items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-cream sm:inline-flex",
          "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px] hover:shadow-ink/60",
        )}
      >
        <XMark className="size-3.5" />
        Connect X
      </Link>
    );
  }

  return (
    <>
      {xHandle ? (
        <span className="hidden items-center gap-1.5 rounded-full border border-ink/12 bg-cream/70 px-3 py-1.5 text-[0.8rem] font-semibold text-ink lg:inline-flex">
          <XMark className="size-3" />@{xHandle}
        </span>
      ) : null}

      {onDashboard ? null : (
        <Link
          to="/app"
          className={cn(
            "hidden items-center gap-1.5 rounded-full bg-lime px-4 py-2 text-sm font-bold text-ink sm:inline-flex",
            "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px] hover:shadow-lime-deep",
          )}
        >
          Go to dashboard
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden="true">
            <path
              d="M5 12h13M12 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      )}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-ink/10 bg-ink text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <TagioMark className="h-7 w-7 text-cream" />
            <span className="text-lg font-extrabold tracking-[-0.03em]">TagioFi</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/55">
            Your tag knows what you want to be paid in. Non-custodial receive-side settlement on
            Robinhood Chain.
          </p>
        </div>

        <FooterColumn
          title="Product"
          links={[
            { label: "Settlement studio", href: "/app" },
            { label: "Trade RWAs", href: "/trade" },
            { label: "Docs", href: "/site/docs.html" },
            { label: "Roadmap", href: "/roadmap" },
          ]}
        />
        <FooterColumn
          title="Protocol"
          links={[
            { label: "Explorer", href: robinhoodExplorerUrl },
            { label: "Relay.link", href: "https://relay.link" },
            { label: "Contact", href: "/site/contact.html" },
          ]}
        />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-cream/10 px-6 py-6 text-xs text-cream/40 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} TagioFi. Non-custodial. Zero held balances.</span>
        <span className="font-mono">Protocol fee 0.15% · Robinhood Chain</span>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-cream/40">{title}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-cream/70 transition-colors hover:text-lime">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Standard page wrapper: nav + pointer-reactive ground + footer. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="tf-grain relative min-h-screen overflow-x-clip bg-cream">
      <SiteNav />
      <main className="relative z-10">{children}</main>
      <SiteFooter />
    </div>
  );
}
