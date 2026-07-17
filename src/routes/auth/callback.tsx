import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { setAuthToken } from "../../lib/auth";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Signing in — Tagio" }],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The JWT arrives as a URL fragment (#token=...) -- fragments never reach
    // the server, so this can only be read client-side, never in a loader.
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const token = new URLSearchParams(hash).get("token");

    if (token) {
      setAuthToken(token);
      navigate({ to: "/dashboard", replace: true });
      return;
    }

    const err = new URLSearchParams(window.location.search).get("error");
    setError(err ?? "No token was returned — please try signing in again.");
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground">Sign-in didn't complete</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <div className="mt-6">
            <a
              href="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Back home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
