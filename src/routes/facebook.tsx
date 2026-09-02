import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { useTagioAuth } from "@/hooks/useTagioAuth";
import { api, friendlyError, shortAddress } from "@/lib/tagio-api";

export const Route = createFileRoute("/facebook")({
  head: () => ({
    meta: [
      { title: "TagioFi · Facebook Bot Early Access" },
      {
        name: "description",
        content:
          "Facebook Bot is coming to Meta. Drop your Facebook handle or profile link for priority early access to Messenger payments, social tipping, and automatic portfolio settlements on Robinhood Chain.",
      },
    ],
  }),
  component: FacebookWaitlistPage,
});

function FacebookWaitlistPage() {
  const auth = useTagioAuth();
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState<{
    position?: number;
    totalCount?: number;
    message?: string;
    alreadyRegistered?: boolean;
  } | null>(null);

  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  // Fetch initial waitlist counter
  useEffect(() => {
    let mounted = true;
    api
      .get<{ totalCount: number }>("/v2/waitlist/facebook/count")
      .then((res) => {
        if (mounted && typeof res?.totalCount === "number") {
          setWaitlistCount(res.totalCount);
        }
      })
      .catch(() => {
        // Fallback silently if API is offline
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = handle.trim();
    if (!clean) {
      toast.error("Please enter your Facebook handle or profile link.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        position?: number;
        totalCount?: number;
        message?: string;
        alreadyRegistered?: boolean;
      }>("/v2/waitlist/facebook", {
        handle: clean,
        wallet: auth.address || undefined,
      });

      setSubmittedData(res);
      if (typeof res.totalCount === "number") {
        setWaitlistCount(res.totalCount);
      }
      toast.success(res.message || "Spot reserved successfully!");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const shareText = encodeURIComponent(
    "I just reserved early access for the @TagioFi Facebook Bot on Robinhood Chain! 🚀 Settle payments & stocks directly in Messenger: https://tagiopay.com/facebook"
  );

  return (
    <PageShell>
      <SpotlightBackground />
      <section className="relative overflow-hidden px-6 pb-24 pt-36 md:pt-44">
        <Aurora className="opacity-40" />
        <div className="tf-grid" />

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
          {/* Top Pill */}
          <span className="tf-chip tf-rise" style={{ animationDelay: "40ms" }}>
            <span className="size-2 rounded-full bg-[#1877F2] animate-pulse" aria-hidden="true" />
            Coming Soon · Meta Ecosystem
          </span>

          {/* Facebook 3D Logo */}
          <div className="tf-rise mt-8" style={{ animationDelay: "100ms" }}>
            <div className="relative mx-auto flex size-24 items-center justify-center rounded-3xl bg-cream/90 p-3 shadow-xl backdrop-blur-md md:size-28">
              <img
                src="/icons8-facebook-480.png"
                alt="Facebook Logo"
                className="size-full object-contain drop-shadow-[0_12px_24px_rgba(24,119,242,0.35)]"
              />
            </div>
          </div>

          {/* Main Headline */}
          <h1
            className="tf-rise mt-6 text-[clamp(2.4rem,6vw,4.5rem)] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink"
            style={{ animationDelay: "160ms" }}
          >
            Facebook Bot <br className="hidden sm:inline" />
            is coming…
          </h1>

          {/* Subtitle */}
          <p
            className="tf-rise mt-6 max-w-xl text-balance text-lg leading-relaxed text-ink/60"
            style={{ animationDelay: "220ms" }}
          >
            Send real value and settle into tokenized stocks directly on Facebook and Messenger.
            Drop your Facebook handle below for priority early access.
          </p>

          {/* Waitlist Counter Badge */}
          {waitlistCount !== null ? (
            <div className="tf-rise mt-4" style={{ animationDelay: "260ms" }}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-cream/80 px-3.5 py-1 text-xs font-semibold text-ink/70">
                ⚡ <strong className="font-mono text-ink">{waitlistCount}</strong> early adopters on the waitlist
              </span>
            </div>
          ) : null}

          {/* Waitlist Form / Confirmation Card */}
          <div
            className="tf-rise mt-10 w-full max-w-lg"
            style={{ animationDelay: "300ms" }}
          >
            <SpotlightCard className="p-6 md:p-8">
              {!submittedData ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                  <div>
                    <label
                      htmlFor="fb-handle"
                      className="block text-xs font-bold uppercase tracking-[0.14em] text-ink/40"
                    >
                      Drop your Facebook handle
                    </label>
                    <div className="relative mt-2">
                      <input
                        id="fb-handle"
                        type="text"
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="e.g. @mark or facebook.com/profile"
                        className="w-full rounded-2xl border border-ink/15 bg-cream/70 px-4 py-3.5 text-sm font-semibold text-ink placeholder:text-ink/35 transition-colors focus:border-ink focus:bg-cream focus:outline-none focus:ring-1 focus:ring-ink"
                        disabled={submitting}
                        autoFocus
                      />
                    </div>
                  </div>

                  {auth.address ? (
                    <div className="flex items-center gap-2 rounded-xl border border-lime/30 bg-lime/10 px-3 py-2 text-xs text-ink/70">
                      <span className="size-1.5 rounded-full bg-lime-deep" />
                      <span>
                        Linking connected wallet:{" "}
                        <strong className="font-mono text-ink">{shortAddress(auth.address)}</strong>
                      </span>
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting || !handle.trim()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-sm font-bold text-cream shadow-md transition-all hover:bg-ink/85 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? "Reserving your spot…" : "Get Early Access 🚀"}
                  </button>
                  <p className="text-center text-[11px] text-ink/40">
                    No spam. You'll receive early beta invitation as soon as the bot launches.
                  </p>
                </form>
              ) : (
                <div className="flex flex-col items-center py-4 text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-lime/25 text-2xl shadow-inner">
                    🎉
                  </div>
                  <h3 className="mt-4 text-xl font-extrabold text-ink">
                    {submittedData.alreadyRegistered ? "You're Already On The List!" : "Spot Reserved!"}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-ink/60">
                    {submittedData.message ||
                      "Your Facebook handle has been recorded for the exclusive private beta."}
                  </p>

                  {submittedData.position ? (
                    <div className="mt-5 rounded-2xl border border-ink/10 bg-cream/70 px-6 py-3 font-mono text-sm font-bold text-ink">
                      Waitlist Position: <span className="text-lime-deep">#{submittedData.position}</span>
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <a
                      href={`https://twitter.com/intent/tweet?text=${shareText}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-bold text-cream transition-all hover:bg-ink/80"
                    >
                      Share on X ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success("Page link copied!");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-cream px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-cream-deep"
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmittedData(null);
                        setHandle("");
                      }}
                      className="rounded-full px-3 py-2 text-xs font-semibold text-ink/40 hover:text-ink"
                    >
                      Submit another handle
                    </button>
                  </div>
                </div>
              )}
            </SpotlightCard>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="relative z-10 mx-auto mt-24 max-w-5xl">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-ink/40">
              What to expect
            </span>
            <h2 className="mt-3 text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold tracking-[-0.03em] text-ink">
              Social commerce meets tokenized equities.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <SpotlightCard className="p-7">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-[#1877F2]/10 text-xl text-[#1877F2]">
                💬
              </div>
              <h3 className="mt-5 text-base font-bold text-ink">Messenger Settlements</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/55">
                Tip friends or request payments in any 1-on-1 or group Messenger chat. Inbound
                funds settle atomically into their elected receive-mix.
              </p>
            </SpotlightCard>

            <SpotlightCard className="p-7">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-lime/20 text-xl text-lime-deep">
                🏷️
              </div>
              <h3 className="mt-5 text-base font-bold text-ink">Facebook Post Tipping</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/55">
                Drop your Tagio handle on Facebook creator posts, community groups, or Marketplace
                listings to accept USDG, ETH, or tokenized stocks with zero friction.
              </p>
            </SpotlightCard>

            <SpotlightCard className="p-7">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-ink/10 text-xl text-ink">
                🛡️
              </div>
              <h3 className="mt-5 text-base font-bold text-ink">Robinhood Chain Security</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/55">
                Everything executes on Robinhood Chain (4663) via Uniswap atomic settlement. 100%
                non-custodial, 0.15% fee, and zero held balances.
              </p>
            </SpotlightCard>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="relative z-10 mx-auto mt-20 max-w-3xl text-center">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-ink/50 transition-colors hover:text-ink"
          >
            Already have a tag? Manage your receive-mix in the Studio ↗
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
