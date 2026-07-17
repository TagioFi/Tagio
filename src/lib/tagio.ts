import { createServerFn } from "@tanstack/react-start";

/* ---------- types (mirror backend responses) ---------- */

export interface Payout {
  wallet: string;
  percentage_bps: number;
}

export interface Social {
  key: string;
  value: string;
}

export interface HashtagRecord {
  hashtag: string;
  owner_wallet: string;
  name: string | null;
  image_url: string | null;
  website_url: string | null;
  active: boolean;
  registered_at: string;
  expires_at: string;
  total_volume_usd: number;
  payouts: Payout[];
  socials: Social[];
}

export interface HashtagResolution {
  hashtag: string;
  primaryDestination: string;
  payouts: Payout[];
  expiresAt: string;
}

export interface HashtagTransaction {
  signature: string;
  amount: string;
  token: string | null;
  is_native: boolean;
  chain: string;
  timestamp: string;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

/* ---------- namespace rules (mirror the contract) ---------- */

export const HASHTAG_RE = /^[a-z0-9_]{3,32}$/;
export const normalizeHashtag = (raw: string) =>
  raw.trim().replace(/^[#@]+/, "").toLowerCase();

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* ---------- server-side fetch helper ---------- */

function apiUrl(path: string) {
  const base =
    import.meta.env.VITE_API_URL ||
    process.env.VITE_API_URL ||
    "https://api.tagiopay.com";
  return base.replace(/\/+$/, "") + path;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok && res.status !== 404) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `TagioPay API error (${res.status})`);
  }
  return res;
}

/* ---------- server functions ---------- */

export const checkHashtag = createServerFn({ method: "GET" })
  .validator((name: string) => normalizeHashtag(name))
  .handler(async ({ data: name }): Promise<AvailabilityResult> => {
    if (!HASHTAG_RE.test(name)) {
      return { available: false, reason: "invalid_format" };
    }
    const res = await apiFetch(`/hashtags/check/${encodeURIComponent(name)}`);
    return (await res.json()) as AvailabilityResult;
  });

export const getHashtag = createServerFn({ method: "GET" })
  .validator((name: string) => normalizeHashtag(name))
  .handler(async ({ data: name }): Promise<HashtagRecord | null> => {
    const res = await apiFetch(`/hashtags/${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    return (await res.json()) as HashtagRecord;
  });

export const resolveHashtag = createServerFn({ method: "GET" })
  .validator((name: string) => normalizeHashtag(name))
  .handler(async ({ data: name }): Promise<HashtagResolution | null> => {
    const res = await apiFetch(`/hashtags/resolve/${encodeURIComponent(name)}`);
    if (res.status === 404) return null;
    return (await res.json()) as HashtagResolution;
  });

export const getHashtagTransactions = createServerFn({ method: "GET" })
  .validator((name: string) => normalizeHashtag(name))
  .handler(async ({ data: name }): Promise<HashtagTransaction[]> => {
    const res = await apiFetch(
      `/transactions/hashtag?hashtag=${encodeURIComponent(name)}`,
    );
    if (res.status === 404) return [];
    return (await res.json()) as HashtagTransaction[];
  });

export const confirmTransaction = createServerFn({ method: "POST" })
  .validator((input: { txHash: string; hashtag: string }) => {
    const txHash = input.txHash.trim();
    const hashtag = normalizeHashtag(input.hashtag);
    if (!TX_HASH_RE.test(txHash)) {
      throw new Error("Transaction hash must be a 0x-prefixed 32-byte hex string");
    }
    if (!HASHTAG_RE.test(hashtag)) {
      throw new Error("Invalid hashtag");
    }
    return { txHash, hashtag };
  })
  .handler(async ({ data }): Promise<{ synced: boolean }> => {
    const res = await apiFetch("/hashtags/confirm-transaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx_hash: data.txHash, hashtag_raw: `#${data.hashtag}` }),
    });
    return (await res.json()) as { synced: boolean };
  });

// Auth is two-step: a verified wallet signature alone isn't enough for a JWT
// until the wallet also has a linked X account (see FRONTEND-INTEGRATION.md).
// The backend returns one of these two shapes from the same 200 response.
export type SignInResult =
  | { token: string; xLinked: true; xHandle: string }
  | { needsXLink: true; authorizeUrl: string };

export const signIn = createServerFn({ method: "POST" })
  .validator(
    (input: { walletAddress: string; signature: string; message: string }) => input,
  )
  .handler(async ({ data }): Promise<SignInResult> => {
    const res = await apiFetch("/auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return (await res.json()) as SignInResult;
  });
