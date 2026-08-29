import { signMessage } from "wagmi/actions";
import bs58 from "bs58";
import { wagmiConfig } from "./wagmi";
import { ensureWallet } from "./resolver-actions";
import { signIn as signInRequest } from "./tagio";

const AUTH_TOKEN_KEY = "tagiopay_auth_token";

// Must match the backend's SIGNIN_MESSAGE exactly (backend/src/routes/auth.ts) --
// verification checks the signed message content byte-for-byte.
export const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";

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

export function isAuthTokenLive(token: string | null): boolean {
  if (!token) return false;
  const expiresAt = tokenExpiresAt(token);
  return expiresAt === null || Date.now() < expiresAt - EXPIRY_MARGIN_MS;
}

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
 * Solana-native sign-in: signs the verification message with the connected Solana wallet,
 * calls the backend, and handles the X linking OAuth redirect if needed.
 */
export async function signInWithSolana(
  publicKey: { toBase58(): string },
  signMessageFn: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<SignInOutcome> {
  const address = publicKey.toBase58();
  const encoded = new TextEncoder().encode(SIGNIN_MESSAGE);
  const signatureBytes = await signMessageFn(encoded);
  const signature = bs58.encode(signatureBytes);

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

/**
 * Legacy EVM sign-in (retained for Robinhood mode).
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
