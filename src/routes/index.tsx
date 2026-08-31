import { createFileRoute, Link } from "@tanstack/react-router";

import { AllocationBar } from "@/components/tf/allocation-bar";
import { AssetMarquee, FeaturedAssets } from "@/components/tf/assets-section";
import { IntentDemo } from "@/components/tf/intent-demo";
import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { TagResolver } from "@/components/tf/tag-resolver";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TagioFi · Send real value like a message" },
      {
        name: "description",
        content:
          "Set your receive-mix once. Any inbound payment settles atomically into the assets you actually keep — tokenized equities, ETFs, gold or stables — on Robinhood Chain.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <PageShell>
      <SpotlightBackground />
      <Hero />
      <SplitPanel />
      <HowItWorks />
      <FeaturedAssets />
      <IntentDemo />
      <ClosingCta />
    </PageShell>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-40 md:pt-48">
      <Aurora />
      <div className="tf-grid" />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <span className="tf-chip tf-rise" style={{ animationDelay: "40ms" }}>
          <span className="size-1.5 rounded-full bg-lime-deep" aria-hidden="true" />
          Live on Robinhood Chain
        </span>

        <h1
          className="tf-rise mt-7 text-[clamp(2.6rem,7vw,5.2rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-ink"
          style={{ animationDelay: "120ms" }}
        >
          Send <span className="tf-bracket tf-underline">real value</span>
          <br />
          like a message.
        </h1>

        <p
          className="tf-rise mt-7 max-w-xl text-balance text-lg leading-relaxed text-ink/55"
          style={{ animationDelay: "200ms" }}
        >
          Your tag knows what you want to be paid in. Set your receive-mix once — every payment
          arrives converted into the assets you actually keep, atomically, in a single signature.
        </p>

        <div
          className="tf-rise mt-10 flex w-full justify-center"
          style={{ animationDelay: "280ms" }}
        >
          <TagResolver />
        </div>

        <div
          className="tf-rise mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink/40"
          style={{ animationDelay: "360ms" }}
        >
          <span>Non-custodial</span>
          <span aria-hidden="true">·</span>
          <span>Atomic settlement</span>
          <span aria-hidden="true">·</span>
          <span>0.15% protocol fee</span>
        </div>
      </div>

      <AssetMarquee className="relative z-10 mt-20" />
    </section>
  );
}

/**
 * The sent/received contrast: one side is whatever the sender held, the other
 * is the receiver's elected mix. Mirrors the brand key visual.
 */
function SplitPanel() {
  const legs = [
    { symbol: "SPYR", basisPoints: 6000 },
    { symbol: "USDG", basisPoints: 3000 },
    { symbol: "GLDR", basisPoints: 1000 },
  ];

  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="grid overflow-hidden rounded-[2rem] border border-ink/10 md:grid-cols-2">
          <div className="relative bg-cream-deep/60 p-10 md:p-14">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink/40">Sent</p>
            <p className="tf-numeric mt-4 text-[clamp(2.4rem,6vw,3.6rem)] font-light text-ink">
              $4,738
            </p>
            <div className="mt-5 h-px w-full bg-ink/12" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-ink/40">
              Any token
            </p>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink/50">
              The sender pays in whatever they hold — ETH, USDG, a tokenized equity. No coordination
              required.
            </p>
          </div>

          <div className="relative overflow-hidden bg-card p-10 md:p-14">
            {/* Lime bloom anchored bottom-right, matching the key visual. */}
            <div
              className="pointer-events-none absolute -bottom-1/3 -right-1/4 size-[130%] rounded-full opacity-70 blur-[80px]"
              style={{ background: "oklch(0.906 0.184 122 / 0.55)" }}
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink/40">Received</p>
              <p className="tf-numeric mt-4 text-[clamp(2.4rem,6vw,3.6rem)] font-light text-ink">
                60 / 30 / 10
              </p>
              <div className="mt-5 h-px w-full bg-ink/12" />
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-ink/40">
                SPYR · USDG · GLDR
              </p>
              <AllocationBar legs={legs} className="mt-6" />
              <p className="mt-6 max-w-xs text-sm leading-relaxed text-ink/55">
                The receiver's elected mix. Every leg is routed and filled in the same transaction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    index: "01",
    title: "Claim your tag",
    body: "Register a handle against your wallet. It becomes the address people actually use — no 42-character strings.",
  },
  {
    index: "02",
    title: "Elect your mix",
    body: "Allocate in basis points across verified tokenized equities, ETFs, commodities and stables. Must total 100%.",
  },
  {
    index: "03",
    title: "Anyone pays, in anything",
    body: "Relay quotes each leg on Robinhood Chain concurrently and assembles one atomic transaction bundle.",
  },
  {
    index: "04",
    title: "It lands converted",
    body: "Assets settle straight into your wallet. Zero held balances, zero custody, one signature from the sender.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="relative scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <header className="max-w-2xl">
          <span className="tf-chip">How it works</span>
          <h2 className="mt-6 text-[clamp(2rem,4.5vw,3.2rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink">
            Receive-side routing, not sender-side guesswork.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-ink/55">
            Traditional rails make the sender decide what you get. TagioFi inverts it: the receiver
            sets the target, and the rail does the conversion on the way in.
          </p>
        </header>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <SpotlightCard key={step.index} className="p-7">
              <span className="tf-numeric text-sm font-bold text-lime-deep">{step.index}</span>
              <h3 className="mt-4 text-lg font-bold tracking-[-0.02em] text-ink">{step.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink/55">{step.body}</p>
            </SpotlightCard>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <SpotlightCard className="p-7">
            <h3 className="text-base font-bold text-ink">Slippage safe-settle</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/55">
              If a leg breaches its slippage bound it settles into USDG instead of taking a bad
              fill.
            </p>
          </SpotlightCard>
          <SpotlightCard className="p-7">
            <h3 className="text-base font-bold text-ink">Same-asset is free</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/55">
              Paying in a token the recipient already elected bypasses DEX routing entirely — no
              fee, no swap.
            </p>
          </SpotlightCard>
          <SpotlightCard className="p-7">
            <h3 className="text-base font-bold text-ink">Verified assets only</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/55">
              The registry is limited to verified Robinhood tokenized equities, ETFs, commodities
              and base currencies.
            </p>
          </SpotlightCard>
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative px-6 pb-28 pt-10">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-ink px-8 py-20 text-center md:px-16">
        <div
          className="pointer-events-none absolute -top-1/2 left-1/2 size-[70%] -translate-x-1/2 rounded-full opacity-40 blur-[90px]"
          style={{ background: "oklch(0.906 0.184 122 / 0.7)" }}
          aria-hidden="true"
        />
        <div className="relative">
          <h2 className="text-[clamp(2rem,5vw,3.4rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-cream">
            Claim your tag.
            <br />
            Get paid in what you keep.
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-balance text-lg leading-relaxed text-cream/55">
            Set a receive-mix in under a minute. Nothing is custodied, and you can change it
            whenever you want.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/app"
              className="rounded-full bg-lime px-7 py-3.5 text-sm font-bold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px] hover:shadow-lime/70"
            >
              Open the studio
            </Link>
            <a
              href="/site/docs.html"
              className="rounded-full border border-cream/25 px-7 py-3.5 text-sm font-bold text-cream transition-colors duration-300 hover:bg-cream/10"
            >
              Read the docs
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
