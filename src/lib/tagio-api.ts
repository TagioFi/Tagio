/**
 * Thin fetch wrapper for the TagioFi v2 REST API.
 *
 * All v2 routes are mounted under /v2/. Auth is a bearer JWT obtained from
 * POST /v2/auth/signin (EVM signature on Robinhood Chain) once the wallet has
 * finished the X authorization hop — see `useTagioAuth`.
 */

import { API_PROXY_PREFIX } from "@/lib/api-config";
import type { V2Session } from "@/types/tagio-v2";

/**
 * Where requests are sent.
 *
 * In the browser this is our own origin's /api prefix, which `src/server.ts`
 * forwards to the real API — same-origin, so the upstream's single-origin CORS
 * policy never applies. On the server there is no origin to be relative to, so
 * we call the upstream directly (a server-to-server request sends no Origin
 * header and isn't gated either way).
 */
export const API_BASE: string =
  typeof window === "undefined"
    ? ((import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/+$/, "") ??
      "https://api.tagiopay.com")
    : API_PROXY_PREFIX;

const TOKEN_KEY = "tagiofi_v2_jwt";
const SESSION_KEY = "tagiofi_v2_session";
const RETURN_TO_KEY = "tagiofi_v2_return_to";

/**
 * Fired on the window whenever the stored session changes in *this* tab.
 * `storage` only fires in other tabs, and the sign-in callback needs the nav
 * (mounted long before it) to notice immediately.
 */
export const AUTH_EVENT = "tagiofi:auth-changed";

/**
 * The sentence POST /v2/auth/signin expects to be signed. The extra lines
 * below it are informational — the wallet shows the whole message, and the
 * nonce keeps two sign-ins from producing the same signature.
 */
export const V2_SIGNIN_MESSAGE =
  "Welcome to TagioFi! Please sign this message to verify your wallet ownership.";

export function buildSignInMessage(walletAddress: string, chainId: number): string {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(16).slice(2);

  return [
    V2_SIGNIN_MESSAGE,
    "",
    `Wallet: ${walletAddress}`,
    `Chain: ${chainId}`,
    `Issued: ${new Date().toISOString()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — requests simply go out unauthenticated */
  }
}

/**
 * Reads a v2 JWT's claims *without verifying it*. The signature is the API's
 * business; the browser only needs to know which wallet the token belongs to
 * and when to stop showing a signed-in UI.
 */
function decodeJwtPayload(token: string): { walletAddress?: string; exp?: number } | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      walletAddress?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

export function jwtExpiresAt(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

export function jwtWalletAddress(token: string): string | null {
  return decodeJwtPayload(token)?.walletAddress ?? null;
}

function announceAuthChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_EVENT));
}

/**
 * The signed-in session: which wallet signed, and which X account it is bound
 * to. A session is only ever written after the X hop, so its presence (with a
 * live token) is what opens the dashboard.
 */
export function getStoredSession(): V2Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<V2Session>;
    if (!parsed.walletAddress) return null;
    if (!getAuthToken()) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      clearAuthSession();
      return null;
    }
    return {
      walletAddress: parsed.walletAddress,
      xHandle: parsed.xHandle ?? null,
      xUserId: parsed.xUserId ?? null,
      expiresAt: parsed.expiresAt ?? null,
    };
  } catch {
    return null;
  }
}

export function setStoredSession(session: V2Session, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setAuthToken(token);
  } catch {
    /* storage blocked — the session simply won't survive a reload */
  }
  announceAuthChange();
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
  announceAuthChange();
}

/** Where to land after the X hop returns — set before leaving for x.com. */
export function setReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    /* falls back to /app */
  }
}

export function takeReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
    // Only ever return to a path on this origin.
    return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** status 0 means the request never reached the API (offline, CORS, DNS). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Turns any thrown value into a short sentence safe to show a user.
 *
 * `fetch` rejects with an opaque TypeError for offline, DNS and CORS failures
 * alike — the browser deliberately hides which — so we describe the situation
 * rather than guessing the cause.
 */
export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return "Can't reach the TagioFi API. Check your connection, or the service may be briefly unavailable.";
    }
    switch (error.status) {
      case 400:
        return error.message || "That request wasn't valid.";
      case 401:
      case 403:
        return "You're not authorized to do that. Try reconnecting your wallet.";
      case 404:
        return error.message || "We couldn't find that.";
      case 409:
        return error.message || "That's already taken.";
      case 429:
        return "Too many requests — give it a moment and try again.";
      case 502:
      case 503:
      case 504:
        // Our own proxy reports upstream-unreachable this way; its message is
        // more specific than a generic 5xx line.
        return error.message || "The TagioFi API is unreachable right now.";
      default:
        if (error.status >= 500) {
          return "The TagioFi API had a problem handling that. Please try again shortly.";
        }
        return error.message || "Something went wrong.";
    }
  }

  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (cause) {
    // fetch only rejects when the request never completed: offline, DNS
    // failure, or a blocked CORS preflight. Normalize to a status-0 ApiError so
    // callers have one error type to handle.
    throw new ApiError(0, `Could not reach ${API_BASE}`, cause);
  }

  // Errors may come back as JSON ({ error }) or as an HTML/text gateway page.
  if (!res.ok) {
    let body: unknown = null;
    let message = `${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      try {
        body = JSON.parse(text);
        const parsed = body as { error?: string; message?: string };
        message = parsed.error ?? parsed.message ?? message;
      } catch {
        body = text;
        if (text && text.length < 200) message = text;
      }
    } catch {
      /* keep the status-line message */
    }
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function withBody(method: string, body: unknown): RequestInit {
  return body === undefined ? { method } : { method, body: JSON.stringify(body) };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, withBody("POST", body)),
  put: <T>(path: string, body?: unknown) => request<T>(path, withBody("PUT", body)),
};

/** Strips a leading @ or # so "@alex", "#alex" and "alex" all resolve alike. */
export function cleanHandle(handle: string): string {
  return handle.trim().replace(/^[#@]/, "");
}

export function shortAddress(address?: string | null): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** 6000 -> "60%", 1250 -> "12.5%" */
export function formatBps(basisPoints: number): string {
  const pct = basisPoints / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, "")}%`;
}

export function formatAmount(value: string | number | undefined, maxFractionDigits = 6): string {
  if (value === undefined || value === null || value === "") return "0";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

export function formatUsd(value: string | number | undefined): string {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 100 ? 2 : 0,
  });
}
