import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { TagioMark } from "@/components/tf/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "TagioFi · Roadmap" },
      {
        name: "description",
        content:
          "The TagioFi roadmap: tag receive-mixes, split tags, dynamic pay-links, payroll vault with $TGIO genesis, and cross-chain pay-in.",
      },
    ],
  }),
  component: RoadmapPage,
});

interface RoadmapPhase {
  number: string;
  badge: string;
  badgeColor: "emerald" | "lime" | "amber" | "purple";
  title: string;
  subtitle: string;
  description: string;
  deliverables: string[];
}

const PHASES: RoadmapPhase[] = [
  {
    number: "01",
    badge: "Live & Deployed",
    badgeColor: "emerald",
    title: "Tag Receive-Mixes & Single-Recipient Settlement",
    subtitle: "The claim and a complete product",
    description:
      "Register and verify your tag with 1-click X OAuth. Choose your portfolio allocation across tokenized equities, ETFs, gold, and stables (SPCX, AAPL, NVDA, TSLA, USDG, ETH). Inbound payments settle atomically in a single signature.",
    deliverables: [
      "Non-custodial tag registry with verified X linking",
      "Robinhood Chain native Uniswap V3 routing engine",
      "Universal Groq AI natural language parser (@TagioPayBot)",
      "Zero-fee same-asset fast path & bounded 0.15% conversion",
    ],
  },
  {
    number: "02",
    badge: "Now Live & Expanding",
    badgeColor: "lime",
    title: "Split Tags, Dynamic Pay-Links & Invoicing",
    subtitle: "One payment, many recipients",
    description:
      "Group tags that split incoming revenue between multiple collaborators according to customizable basis points. Each collaborator receives their payout converted into their own personal receive-mix.",
    deliverables: [
      "Multi-recipient split tags with basis point distribution",
      "Shareable payment links (/pay/:handle) & custom invoice creator",
      "Studio dashboard activity feed with real-time pending mentions",
      "Instant Twitter/X pending transaction review modal",
    ],
  },
  {
    number: "03",
    badge: "Upcoming",
    badgeColor: "amber",
    title: "RosterVault Payroll & $TGIO Genesis",
    subtitle: "Automated team payouts with value accrual",
    description:
      "A smart contract payroll vault that automates scheduled salaries for teams and DAOs. $TGIO genesis activates the protocol fee switch, routing settlement revenue to open-market buybacks and staker rewards.",
    deliverables: [
      "RosterVault scheduled team disbursements",
      "$TGIO token genesis and staking contract",
      "80/10/5/5 fee flywheel: 80% buyback, 10% stakers, 5% treasury, 5% core dev",
      "Gas-optimized batch execution on Robinhood Chain",
    ],
  },
  {
    number: "04",
    badge: "Future Scope",
    badgeColor: "purple",
    title: "Social Tags, Cross-Chain Pay-In & SDK",
    subtitle: "Pay from any chain, receive your exact mix",
    description:
      "Cross-chain pay-in powered by Relay.link. Anyone from Ethereum, Arbitrum, Base, Solana, or Polygon pays your tag with any token, and it lands as your chosen portfolio on Robinhood Chain.",
    deliverables: [
      "Cross-chain bridge & swap routing into Robinhood Chain",
      "Telegram & Discord bot extensions",
      "Embedded <TagioCheckout /> React component & Web SDK",
      "Custom merchant API for e-commerce checkout integration",
    ],
  },
];

const COMPARISON_ROWS = [
  {
    category: "Who gets paid this way",
    closedPayroll: "One company's staff",
    walletSwaps: "Nobody (buy-side only)",
    tagio: "Anyone with a tag",
  },
  {
    category: "Asset choice",
    closedPayroll: "Single curated fund",
    walletSwaps: "Manual after arrival",
    tagio: "Your custom portfolio mix (up to 8 assets)",
  },
  {
    category: "Commerce & Invoicing",
    closedPayroll: "No",
    walletSwaps: "No",
    tagio: "Yes, 1-click pay-links & bot mentions",
  },
  {
    category: "Custody & Balances",
    closedPayroll: "Vendor holds custody",
    walletSwaps: "Self-custody (manual steps)",
    tagio: "Zero custody, atomic single-signature",
  },
  {
    category: "Settlement",
    closedPayroll: "Closed batch cycle",
    walletSwaps: "Hold-to-earn fee drip",
    tagio: "Arrives immediately as your chosen mix",
  },
  {
    category: "Payroll at scale",
    closedPayroll: "One employer at a time",
    walletSwaps: "No automated payroll",
    tagio: "RosterVault on-chain scheduled disbursements",
  },
];

const FAQS = [
  {
    q: "What assets can I receive in my mix?",
    a: "Your receive-mix draws from verified tokenized equities and ETFs (SPCX, AAPL, NVDA, TSLA, GOOGL, AMZN, MSFT, META, COIN), tokenized metals, USDG, and ETH on Robinhood Chain, supporting up to 8 legs totaling 100%. If an asset experiences liquidity constraints, that leg safely settles in USDG with an on-chain notice.",
  },
  {
    q: "What does using TagioFi cost?",
    a: "Same-asset transfers (e.g. USDG to USDG or ETH to ETH) are permanently 100% free with zero protocol fees. Converted volume pays a modest, bounded 0.15% settlement fee that feeds the $TGIO buyback and staker distribution mechanism (80/10/5/5).",
  },
  {
    q: "How does the Twitter/X bot work with the roadmap?",
    a: "Our bot (@TagioPayBot) runs on an ultra-fast Groq LPU inference pipeline using Qwen 2.5/3.8. Anyone can mention the bot with any natural phrasing (e.g. '@TagioPayBot send @nobody 0.5 usdg' or '$send @team 50 usdg for design') to instantly generate actionable settlement transactions.",
  },
  {
    q: "Is TagioFi custodial at any stage?",
    a: "No. TagioFi is 100% non-custodial. There are zero user balances held by the protocol. Every swap and transfer executes atomically during settlement, meaning either the entire transaction succeeds and lands in your wallet or reverts completely.",
  },
];

function RoadmapPage() {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  return (
    <PageShell>
      <SpotlightBackground />
      <Aurora />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 pt-36 pb-16 text-center">
        <div className="flex justify-center">
          <span className="tf-chip">
            <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
            Robinhood Chain (4663) · Non-custodial · Tag-native settlement
          </span>
        </div>

        <h1 className="mt-7 text-4xl font-extrabold tracking-[-0.04em] text-ink sm:text-6xl">
          The TagioFi roadmap.
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-balance text-lg leading-relaxed text-ink/65">
          Phase by phase, from tag receive-mixes to splits, team payroll, and cross-chain pay-in.
          Phase 1 is live and already a complete non-custodial settlement engine.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/app"
            className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-cream transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink/40"
          >
            Open Dashboard
          </Link>
          <a
            href="/site/docs.html"
            className="rounded-full border border-ink/15 bg-cream/50 px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-cream-deep hover:text-ink"
          >
            Read the Docs
          </a>
        </div>
      </section>

      {/* ── Phases Timeline ────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-12">
        <div className="space-y-6">
          {PHASES.map((phase) => (
            <SpotlightCard
              key={phase.number}
              className={cn(
                "p-8 transition-all duration-300 hover:border-ink/25",
                phase.badgeColor === "emerald" && "border-emerald-500/30 shadow-emerald-500/5",
                phase.badgeColor === "lime" && "border-lime/40 shadow-lime/5",
              )}
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-ink/10 bg-cream-deep font-mono text-lg font-bold text-ink">
                    {phase.number}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider",
                          phase.badgeColor === "emerald" && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
                          phase.badgeColor === "lime" && "bg-lime/20 text-lime-deep",
                          phase.badgeColor === "amber" && "bg-amber-500/15 text-amber-900 dark:text-amber-300",
                          phase.badgeColor === "purple" && "bg-purple-500/15 text-purple-800 dark:text-purple-300",
                        )}
                      >
                        {phase.badge}
                      </span>
                      <span className="text-xs font-medium text-ink/40">· {phase.subtitle}</span>
                    </div>

                    <h2 className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                      {phase.title}
                    </h2>

                    <p className="mt-3 text-sm leading-relaxed text-ink/65">
                      {phase.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-ink/8 pt-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
                  Key Deliverables
                </h3>
                <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {phase.deliverables.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs font-medium text-ink/75">
                      <span className="mt-0.5 text-lime-deep font-bold">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </section>

      {/* ── Comparison Table: The Field ────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
            Market Landscape
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            The field, and where they stop short.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink/60">
            Wallets solved the buy side. Closed pilots proved demand. TagioFi provides universal,
            non-custodial receive-side settlement for anyone with a tag.
          </p>
        </div>

        <SpotlightCard className="mt-10 overflow-x-auto p-6 sm:p-8">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 pb-4 text-xs font-bold uppercase tracking-wider text-ink/45">
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 px-4 text-ink/40">Closed payroll pilots</th>
                <th className="pb-3 px-4 text-ink/40">Wallet swaps</th>
                <th className="pb-3 pl-4 text-ink font-extrabold">TagioFi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.category} className="group transition-colors hover:bg-cream-deep/40">
                  <td className="py-4 pr-4 font-semibold text-ink">{row.category}</td>
                  <td className="py-4 px-4 text-ink/55">{row.closedPayroll}</td>
                  <td className="py-4 px-4 text-ink/55">{row.walletSwaps}</td>
                  <td className="py-4 pl-4 font-bold text-lime-deep dark:text-lime">
                    {row.tagio}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SpotlightCard>
      </section>

      {/* ── Economics / Fee Architecture (80/10/5/5) ─────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-2">
          <SpotlightCard className="p-8">
            <span className="tf-chip bg-lime/20 text-lime-deep">Fee Model</span>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-ink">
              Bounded fees, permanent free path
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/65">
              Sent asset equals mixed asset → direct transfer, zero fee, forever. The rail grows
              first. Only converted volume pays a bounded settlement fee of 0.15%, enforced on-chain.
            </p>
            <div className="mt-6 space-y-2.5 rounded-xl border border-ink/10 bg-cream/70 p-4 text-xs">
              <div className="flex justify-between">
                <span className="font-medium text-ink/55">Same-Asset Payment:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">0.00% (Free Forever)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-ink/55">Cross-Asset Conversion:</span>
                <span className="font-bold text-ink">0.15% (Protocol Fee)</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-ink/55">Execution Settlement:</span>
                <span className="font-bold text-ink">Single Atomic Signature</span>
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-8">
            <span className="tf-chip bg-amber-500/20 text-amber-900 dark:text-amber-300">
              $TGIO Value Accrual
            </span>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-ink">
              80 / 10 / 5 / 5 Value Flywheel
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/65">
              All protocol settlement revenues route directly to open-market $TGIO buybacks, active
              stakers, ecosystem development, and security reserves.
            </p>
            <div className="mt-6 space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold text-ink">
                  <span>80% $TGIO Open-Market Buybacks</span>
                  <span>8,000 bps</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full bg-lime-deep" style={{ width: "80%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-ink">
                  <span>10% Active Staker Yield Distribution</span>
                  <span>1,000 bps</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: "10%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-ink">
                  <span>5% Protocol Growth &amp; Ecosystem Treasury</span>
                  <span>500 bps</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full bg-ink/60" style={{ width: "5%" }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-ink">
                  <span>5% Core Protocol Security &amp; Keepers</span>
                  <span>500 bps</span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-ink/10 overflow-hidden">
                  <div className="h-full bg-ink/40" style={{ width: "5%" }} />
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </section>

      {/* ── FAQ Section ────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
            Got questions?
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Frequently asked questions.
          </h2>
        </div>

        <div className="mt-10 space-y-4">
          {FAQS.map((faq, index) => {
            const open = activeFaq === index;
            return (
              <SpotlightCard
                key={faq.q}
                className="cursor-pointer p-6 transition-all duration-200"
                onClick={() => setActiveFaq(open ? null : index)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-ink sm:text-lg">{faq.q}</h3>
                  <span className="ml-4 font-mono text-lg text-ink/50">
                    {open ? "−" : "+"}
                  </span>
                </div>
                {open ? (
                  <p className="mt-3 text-sm leading-relaxed text-ink/65 animate-in fade-in duration-200">
                    {faq.a}
                  </p>
                ) : null}
              </SpotlightCard>
            );
          })}
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-6 pb-28 pt-8 text-center">
        <SpotlightCard className="p-12 border-lime/40">
          <TagioMark className="mx-auto size-12 text-ink" />
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Follow the build. Claim your tag.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink/60">
            Set your receive-mix once. Every tip, invoice, and payment lands converted into what you keep.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/app"
              className="rounded-full bg-ink px-8 py-3.5 text-sm font-bold text-cream transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink/40"
            >
              Get Started Now
            </Link>
            <a
              href="https://x.com/tagiofi"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-ink/15 bg-cream/70 px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-cream-deep hover:text-ink"
            >
              Follow on X
            </a>
          </div>
        </SpotlightCard>
      </section>
    </PageShell>
  );
}
