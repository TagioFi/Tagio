/**
 * Thin fetch wrapper for the TagioFi v2 REST API.
 *
 * All v2 routes are mounted under /v2/. Auth, when present, is a bearer JWT
 * obtained from POST /v2/auth/signin (EVM signature on Robinhood Chain).
 */

import { API_PROXY_PREFIX } from "@/lib/api-config";

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
