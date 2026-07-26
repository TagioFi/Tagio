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

async function apiFetch(path: string, init?: RequestInit, okStatuses: number[] = [404]): Promise<Response> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok && !okStatuses.includes(res.status)) {
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

/* ---------- pending transactions (created by the X bot, signed by the user) ---------- */

export interface UnsignedTx {
  to: string;
  data: string;
  value: string;
  chainId: number;
}

export interface PendingTransaction {
  id: number;
  kind: "payment" | "swap" | "disperse" | "deposit" | "claim";
  target_type: "hashtag" | "wallet" | "x_account" | "swap" | "disperse" | "deposit" | "claim";
  target_value: string;
  target_x_user_id: string | null;
  resolved_to_wallet: string;
  // Payment rows: 'native' | 'usdg'. Swap rows: the fromSymbol being spent
  // (e.g. 'ETH', 'USDG', or a stock ticker when selling one for ETH/USDG).
  token: string;
  amount: string;
  unsigned_to: string;
  unsigned_data: string;
  unsigned_value: string;
  // Approvals to sign (and wait for confirmation on) before unsigned_to/data/value.
  approvals: UnsignedTx[];
  // Disperse rows only -- additional steps signed in order AFTER
  // unsigned_to/data/value (e.g. one ClaimEscrow deposit per unlinked
  // giveaway/airdrop winner).
  extra_steps: UnsignedTx[];
  quote_route: string | null;
  price_impact_pct: string | null;
  tweet_url: string | null;
  status: string;
  created_at: string;
  // Every request gets a 24h window (see 002_x_integration.sql); the on-load
  // nudge counts down to this and turns urgent as it nears.
  expires_at: string;
  // 'x_bot' for a live mention/DM command; 'giveaway' | 'airdrop' |
  // 'direct-send' when this row came from claiming a past unclaimed
  // allocation after linking an X account.
  source: string;
}

export const getPendingTransactions = createServerFn({ method: "GET" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }): Promise<PendingTransaction[]> => {
    const res = await apiFetch("/transactions/pending", {
      headers: { authorization: `Bearer ${data.token}` },
    });
    return (await res.json()) as PendingTransaction[];
  });

export const broadcastPendingTransaction = createServerFn({ method: "POST" })
  .validator((input: { token: string; id: number; txHash: string }) => input)
  .handler(async ({ data }): Promise<{ synced: boolean }> => {
    const res = await apiFetch(`/transactions/pending/${data.id}/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ tx_hash: data.txHash }),
    });
    return (await res.json()) as { synced: boolean };
  });

export const cancelPendingTransaction = createServerFn({ method: "POST" })
  .validator((input: { token: string; id: number }) => input)
  .handler(async ({ data }): Promise<{ cancelled: boolean }> => {
    const res = await apiFetch(`/transactions/pending/${data.id}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${data.token}` },
    });
    return (await res.json()) as { cancelled: boolean };
  });

/* ---------- RWA stock trading (ETH/USDG <-> tokenized equities via Uniswap) ---------- */

export interface TokenInfo {
  symbol: string;
  address: string;
  native?: boolean;
  decimals: number;
}

export interface SwapTokenList {
  swapIn: TokenInfo[]; // ETH, USDG
  stocks: TokenInfo[]; // curated RWA allowlist
}

export interface SwapQuote {
  amountOut: string;
  decimalsOut: number;
  priceImpactPct: number;
  route: string;
}

export interface SwapPlan {
  approvals: UnsignedTx[];
  swap: UnsignedTx;
  quote: SwapQuote;
}

export const getSwapTokens = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwapTokenList> => {
    const res = await apiFetch("/tokens");
    return (await res.json()) as SwapTokenList;
  },
);

// Live preview only -- no unsigned tx here, just enough to show an expected
// rate and price-impact warning before the user commits. Returns null on a
// 422 (no route/liquidity for this pair yet) instead of throwing, since
// that's an expected state for a thin or nonexistent RWA pool, not an error.
export const getSwapQuote = createServerFn({ method: "POST" })
  .validator((input: { fromSymbol: string; toSymbol: string; amountIn: number }) => input)
  .handler(async ({ data }): Promise<SwapQuote | null> => {
    const res = await apiFetch(
      "/swap/quote",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) },
      [422],
    );
    if (res.status === 422) return null;
    return (await res.json()) as SwapQuote;
  });

// Builds fresh, real unsigned transactions (0-2 approvals + the swap itself)
// for the connected wallet to sign -- always re-quoted server-side at this
// exact moment rather than reusing an earlier preview, so the minimum-out
// baked into the swap reflects the current pool state as closely as
// possible right before signing.
export const getSwapPlan = createServerFn({ method: "POST" })
  .validator((input: { fromSymbol: string; toSymbol: string; amountIn: number; walletAddress: string }) => input)
  .handler(async ({ data }): Promise<SwapPlan | null> => {
    const res = await apiFetch(
      "/swap/plan",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) },
      [422],
    );
    if (res.status === 422) return null;
    return (await res.json()) as SwapPlan;
  });

/* ---------- wallet balances (ETH/USDG + held RWA stocks, for the wallet panel) ---------- */

export interface WalletBalance {
  symbol: string;
  address: string;
  native: boolean;
  decimals: number;
  balance: string; // base units
}

export const getWalletBalances = createServerFn({ method: "GET" })
  .validator((input: { address: string }) => input)
  .handler(async ({ data }): Promise<WalletBalance[]> => {
    const res = await apiFetch(`/wallet/${data.address}/balances`);
    return (await res.json()) as WalletBalance[];
  });

// "Who is this wallet" lookup -- whatever it's publicly known as: a linked
// X handle, and its top hashtags by volume. Used for the private-send
// recipient/sender identity modal.
export interface WalletIdentity {
  xHandle: string | null;
  hashtags: { hashtag: string; name: string | null; total_volume_usd: number }[];
}

export const getWalletIdentity = createServerFn({ method: "GET" })
  .validator((address: string) => address)
  .handler(async ({ data: address }): Promise<WalletIdentity> => {
    const res = await apiFetch(`/wallet/${address}/identity`);
    return (await res.json()) as WalletIdentity;
  });

/* ---------- causes (Wave 5: donations/crowdfunding) ---------- */

export interface Cause {
  causeId: number;
  name: string;
  organizer: string;
  token: string; // zero address = native ETH
  goal: string;
  totalRaised: string;
  totalWithdrawn: string;
}

export interface LeaderboardEntry {
  donor: string;
  total: string;
}

export const getCauses = createServerFn({ method: "GET" }).handler(async (): Promise<Cause[]> => {
  const res = await apiFetch("/causes");
  return (await res.json()) as Cause[];
});

export const getCauseLeaderboard = createServerFn({ method: "GET" })
  .validator((causeId: number) => causeId)
  .handler(async ({ data: causeId }): Promise<LeaderboardEntry[]> => {
    const res = await apiFetch(`/causes/${causeId}/leaderboard`);
    return (await res.json()) as LeaderboardEntry[];
  });

/* ---------- escrow (Wave 6: generic Create->Accept->Deliver->Release) ---------- */

export interface Escrow {
  escrowId: number;
  creator: string;
  counterparty: string;
  token: string; // zero address = native ETH
  amount: string;
  description: string;
  status: "None" | "Created" | "Accepted" | "Delivered" | "Released" | "Cancelled";
  deliverDeadline: string;
  releaseDeadline: string;
  proofUrl: string;
}

export const getEscrows = createServerFn({ method: "GET" })
  .validator((wallet: string) => wallet)
  .handler(async ({ data: wallet }): Promise<Escrow[]> => {
    const res = await apiFetch(`/escrows?wallet=${wallet}`);
    return (await res.json()) as Escrow[];
  });

export const getEscrowDetails = createServerFn({ method: "GET" })
  .validator((escrowId: number) => escrowId)
  .handler(async ({ data: escrowId }): Promise<Escrow> => {
    const res = await apiFetch(`/escrows/${escrowId}`);
    return (await res.json()) as Escrow;
  });

/* ---------- private send (Wave 7: shields the sender from the recipient) ---------- */

export interface PrivateSend {
  id: number;
  senderWallet: string;
  recipientWallet: string;
  token: "native" | "usdg";
  amount: string;
  keeperFeeWei: string; // always native ETH wei, regardless of `token`
  status: "pending_send" | "sent" | "claimed" | "failed";
  sentTxHash: string | null;
  claimedTxHash: string | null;
  claimedBy: "keeper" | "self" | null;
  createdAt: string;
  claimedAt: string | null;
}

export const getPrivateSends = createServerFn({ method: "GET" })
  .validator((wallet: string) => wallet)
  .handler(async ({ data: wallet }): Promise<PrivateSend[]> => {
    const res = await apiFetch(`/private-sends?wallet=${wallet}`);
    return (await res.json()) as PrivateSend[];
  });

// Dashboard-native equivalent of the $psend bot command -- creates the
// pending_transactions row the sender then signs via the normal Pending
// tab flow. Requires auth since the backend resolves the recipient from the
// caller's own linked X account context. `recipient` accepts @handle,
// #hashtag, or a raw 0x wallet address -- same three kinds a plain send
// accepts, disambiguated server-side by prefix.
export const createPrivateSend = createServerFn({ method: "POST" })
  .validator((input: { token: string; recipient: string; amount: string; sendToken: "native" | "usdg" }) => input)
  .handler(async ({ data }): Promise<{ created: boolean; id: number }> => {
    const res = await apiFetch("/private-sends", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ recipient: data.recipient, amount: data.amount, token: data.sendToken }),
    });
    return (await res.json()) as { created: boolean; id: number };
  });

// Manual claim fallback -- builds the recipient's own signed claim(), same
// pending_transactions flow as everything else. Only works while the
// keeper hasn't already claimed it first (status must still be 'sent').
export const claimPrivateSend = createServerFn({ method: "POST" })
  .validator((input: { token: string; id: number }) => input)
  .handler(async ({ data }): Promise<{ created: boolean }> => {
    const res = await apiFetch(`/private-sends/${data.id}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${data.token}` },
    });
    return (await res.json()) as { created: boolean };
  });
