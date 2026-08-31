/**
 * Landing pad for the X authorization hop (step 2 of connect wallet → connect
 * X → dashboard).
 *
 * `GET /v2/auth/x/callback` on the API finishes the OAuth 2.0 PKCE exchange and
 * redirects here with either `#token=…&xHandle=…` or `?error=…`. The token is
 * in the fragment on purpose: fragments are never sent to a server, so the JWT
 * doesn't end up in access logs or a Referer header.
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PageShell } from "@/components/tf/site-chrome";
import { Aurora, SpotlightBackground, SpotlightCard } from "@/components/tf/spotlight";
import { jwtExpiresAt, jwtWalletAddress, setStoredSession, takeReturnTo } from "@/lib/tagio-api";
import type { V2Session } from "@/types/tagio-v2";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Finishing sign-in · TagioFi" }] }),
  component: AuthCallbackPage,
});

const ERROR_COPY: Record<string, string> = {
  expired_or_invalid_state:
    "That sign-in link expired. Head back and connect X again — it only takes a moment.",
  access_denied: "X authorization was declined. The dashboard needs a linked X account to open.",
};

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // Runs after mount only: the fragment never reaches the server render.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);

    const failure = search.get("error") ?? hash.get("error");
    if (failure) {
      setError(ERROR_COPY[failure] ?? `X sign-in failed (${failure}).`);
      return;
    }

    const token = hash.get("token");
    const walletAddress = token ? jwtWalletAddress(token) : null;
    if (!token || !walletAddress) {
      setError("That sign-in link was incomplete. Connect X again from the dashboard.");
      return;
    }

    const session: V2Session = {
      walletAddress,
      xHandle: hash.get("xHandle"),
      expiresAt: jwtExpiresAt(token),
    };
    setStoredSession(session, token);

    // Drop the token from the address bar before anything can share the URL.
    window.history.replaceState(null, "", window.location.pathname);

    const returnTo = takeReturnTo();
    void navigate({ to: returnTo && returnTo !== "/auth/callback" ? returnTo : "/app" });
  }, [navigate]);

  return (
    <PageShell>
      <SpotlightBackground />
      <section className="relative overflow-hidden px-6 pb-32 pt-40">
        <Aurora className="opacity-40" />

        <div className="relative z-10 mx-auto max-w-lg">
          <SpotlightCard className="flex flex-col items-center gap-4 p-14 text-center">
            {error ? (
              <>
                <span className="tf-chip">Sign-in interrupted</span>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  Couldn't finish linking X
                </h1>
                <p className="max-w-sm text-sm text-ink/55">{error}</p>
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/app" })}
                  className="mt-1 rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-cream transition-colors hover:bg-ink/85"
                >
                  Back to the dashboard
                </button>
              </>
            ) : (
              <>
                <span className="tf-chip">Step 2 of 2</span>
                <h1 className="text-xl font-bold tracking-[-0.02em] text-ink">
                  Linking your X account…
                </h1>
                <p className="max-w-sm text-sm text-ink/55">
                  Binding the verified handle to your wallet, then opening your dashboard.
                </p>
              </>
            )}
          </SpotlightCard>
        </div>
      </section>
    </PageShell>
  );
}
