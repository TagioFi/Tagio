import { signMessage } from "wagmi/actions";
import { wagmiConfig } from "./wagmi";
import { ensureWallet } from "./resolver-actions";
import { signIn as signInRequest } from "./tagio";

const AUTH_TOKEN_KEY = "tagiopay_auth_token";

// Must match the backend's SIGNIN_MESSAGE exactly (backend/src/routes/auth.ts) --
// viem's verifyMessage checks the signed message content byte-for-byte.
const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

// Treat a token as dead slightly before its stated expiry so one that lapses
// mid-flight doesn't come back as a surprise 401.
const EXPIRY_MARGIN_MS = 30 * 1000;

// The backend signs 7-day JWTs (backend/src/routes/auth.ts:20) and rejects an
// expired one with a 401 (middleware/auth.ts:21), so the mere presence of *a*
// string in localStorage is not proof of a live session. Reading `exp` here is
// what lets the dashboard re-run sign-in on load instead of sitting on a dead
// token, 401ing every request behind a UI that still looks signed in.
function tokenExpiresAt(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Fail-open on an unreadable/exp-less token: the server is the real authority,
// and a parse quirk here must not lock a genuinely valid session out. An
// actually-dead token is still caught by the 401 path (see
// isSessionExpiredError in ./tagio).
export function isAuthTokenLive(token: string | null): boolean {
  if (!token) return false;
  const expiresAt = tokenExpiresAt(token);
  return expiresAt === null || Date.now() < expiresAt - EXPIRY_MARGIN_MS;
}

// Same as getAuthToken, but never hands back an expired token -- and clears it
// on the way out so the next read can't resurrect it. Callers that gate UI or
// fire authed requests should prefer this.
export function getLiveAuthToken(): string | null {
  const token = getAuthToken();
  if (!token) return null;
  if (isAuthTokenLive(token)) return token;
  clearAuthToken();
  return null;
}

export type SignInOutcome =
  | { status: "signed_in"; token: string; xHandle: string }
  | { status: "redirecting_to_x" };

/**
 * Full two-step TagioPay sign-in: connects the wallet (if needed), signs the
 * verification message, and calls the backend. If the wallet already has a
 * linked X account, stores the JWT and returns immediately. If not, this does a
 * full-page redirect to X's OAuth authorize URL (per FRONTEND-INTEGRATION.md --
 * not a fetch) and never resolves "signed_in" for that call; the flow completes
 * later at /auth/callback once X redirects back.
 */
export async function signInWithWallet(): Promise<SignInOutcome> {
  const address = await ensureWallet();
  const signature = await signMessage(wagmiConfig, { account: address, message: SIGNIN_MESSAGE });

  const result = await signInRequest({
    data: { walletAddress: address, signature, message: SIGNIN_MESSAGE },
  });

  if ("token" in result) {
    setAuthToken(result.token);
    return { status: "signed_in", token: result.token, xHandle: result.xHandle };
  }

  window.location.href = result.authorizeUrl;
  return { status: "redirecting_to_x" };
}
