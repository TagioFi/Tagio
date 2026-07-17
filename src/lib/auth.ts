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
