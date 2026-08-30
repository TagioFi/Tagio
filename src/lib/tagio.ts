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
  raw
    .trim()
    .replace(/^[#@]+/, "")
    .toLowerCase();

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* ---------- server-side fetch helper ---------- */

function apiUrl(path: string) {
  const base =
    import.meta.env.VITE_API_URL || process.env.VITE_API_URL || "https://api.tagiopay.com";
  return base.replace(/\/+$/, "") + path;
}

// A 401 is a *session* problem, not a request problem: the stored JWT is
// missing, expired, or no longer accepted. Callers have to be able to tell the
// two apart -- otherwise a dead session reads as "the server said you have
// nothing", which is exactly how an expired token used to blank the dashboard's
// Pending tab. One exported string so the throw site and every check agree.
export const SESSION_EXPIRED_MESSAGE =
  "Your TagioPay session expired — reconnect your wallet to continue.";

// Matched on the message rather than an error subclass on purpose: these throws
// originate inside a server function, so what the client catches is a
// re-created Error, not the instance thrown on the server.
export function isSessionExpiredError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : String((err as { message?: unknown })?.message ?? err ?? "");
  return message.includes(SESSION_EXPIRED_MESSAGE);
}

async function apiFetch(
  path: string,
  init?: RequestInit,
  okStatuses: number[] = [404],
): Promise<Response> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok && !okStatuses.includes(res.status)) {
    if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
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
    const res = await apiFetch(`/transactions/hashtag?hashtag=${encodeURIComponent(name)}`);
    if (res.status === 404) return [];
    return (await res.json()) as HashtagTransaction[];
  });

// Reverse lookup: which handles does this wallet own? The NFT isn't
// enumerable, so this is the indexer's answer rather than an onchain one.
// Owner is the Robinhood-side address that registered the handle, so this only
// accepts an EVM address — a base58 Solana key 400s here by design.
export const getHashtagsByOwner = createServerFn({ method: "GET" })
  .validator((owner: string) => owner.trim())
  .handler(async ({ data: owner }): Promise<HashtagRecord[]> => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(owner)) return [];
    const res = await apiFetch(
      `/hashtags?owner=${encodeURIComponent(owner)}`,
      undefined,
      [400, 404],
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as HashtagRecord[];
    return Array.isArray(rows) ? rows : [];
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
  .validator((input: { walletAddress: string; signature: string; message: string }) => input)
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

/* ---------- xStocks trading (SOL/USDC <-> tokenized equities on Solana) ---------- */

export interface TokenInfo {
  symbol: string;
  address: string;
  native?: boolean;
  decimals: number;
}

/** Shape of the Solana entries GET /tokens returns (backend rwaTokens.ts). */
export interface SolanaTokenInfo {
  slug?: string;
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  isNative?: boolean;
  isBaseCurrency?: boolean;
  underlyingTicker?: string;
  iconUrl?: string;
}

export interface SwapTokenList {
  /** SOL and USDC — the only two working currencies, per the spec. */
  swapIn: SolanaTokenInfo[];
  /** Curated featured xStocks. */
  stocks: SolanaTokenInfo[];
  /** The full 714+ xStocks directory (spec Module 7). */
  allStocks: SolanaTokenInfo[];
  /** Preserved Robinhood-side EVM token set; unused by the Solana UI. */
  robinhood?: { swapIn: TokenInfo[]; stocks: TokenInfo[] };
}

// One shape covering both backends: the Solana path (Relay/Jupiter) returns
// `routing` + `rate`, the legacy Robinhood path returns `route` + `decimalsOut`.
// Callers read through `swapRouteLabel` rather than picking a field themselves.
export interface SwapQuote {
  amountIn?: string;
  amountOut: string;
  decimalsOut?: number;
  priceImpactPct: number;
  rate?: string;
  route?: string;
  routing?: { type: string; pool: string };
}

export const swapRouteLabel = (quote: SwapQuote): string =>
  quote.routing ? `${quote.routing.pool} · ${quote.routing.type}` : (quote.route ?? "—");

/* ---------- Relay step payloads ---------- */

// Spelled out concretely rather than left as `unknown`: these cross a server
// function boundary, and TanStack validates that every returned type is
// serializable — an `unknown[]` is rejected outright.
export interface RelayAccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface RelayInstructionJson {
  /** Relay has been observed using either key for the account list. */
  keys?: RelayAccountMeta[];
  accounts?: RelayAccountMeta[];
  programId: string;
  /** base64 (usual), hex, or a raw byte array. */
  data: string | number[];
}

export interface RelayStepItem {
  status?: string;
  data?: {
    instructions?: RelayInstructionJson[];
    addressLookupTableAddresses?: string[];
  };
}

export interface RelayStep {
  id?: string;
  action?: string;
  description?: string;
  kind?: string;
  requestId?: string;
  items?: RelayStepItem[];
}

/** POST /swap/plan on a Solana pair — Relay steps to sign with the wallet. */
export interface SolanaSwapPlan {
  type: "relay_solana";
  requestId: string;
  steps: RelayStep[];
  // Relay's own nested quote metadata; passed straight through to the UI and
  // never narrowed here, so it stays `any` rather than a fragile mirror.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fees?: any;
}

/** POST /swap/plan on the legacy Robinhood pair — unsigned EVM transactions. */
export interface EvmSwapPlan {
  approvals: UnsignedTx[];
  swap: UnsignedTx;
  quote: SwapQuote;
}

export type SwapPlan = SolanaSwapPlan | EvmSwapPlan;

export const isSolanaSwapPlan = (plan: SwapPlan): plan is SolanaSwapPlan =>
  (plan as SolanaSwapPlan)?.type === "relay_solana";

export const getSwapTokens = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwapTokenList> => {
    const res = await apiFetch("/tokens");
    const list = (await res.json()) as Partial<SwapTokenList>;
    // Older deployments of the API predate `allStocks`; fall back to the
    // featured set so the directory renders something rather than nothing.
    return {
      swapIn: list.swapIn ?? [],
      stocks: list.stocks ?? [],
      allStocks: list.allStocks ?? list.stocks ?? [],
      robinhood: list.robinhood,
    };
  },
);

// Live preview only -- no unsigned tx here, just enough to show an expected
// rate and price-impact warning before the user commits. Returns null on a
// 422 (no route/liquidity for this pair yet) instead of throwing, since
// that's an expected state for a thin or nonexistent RWA pool, not an error.
export const getSwapQuote = createServerFn({ method: "POST" })
  .validator((input: { fromSymbol: string; toSymbol: string; amountIn: number }) => input)
  .handler(async ({ data }): Promise<SwapQuote | null> => {
    // 404 is what the API actually returns for "no liquidity route found for
    // this pair"; 422 is kept alongside it so an older deployment still reads
    // as "no route" rather than throwing.
    const res = await apiFetch(
      "/swap/quote",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      },
      [404, 422],
    );
    if (res.status === 404 || res.status === 422) return null;
    return (await res.json()) as SwapQuote;
  });

// Builds fresh, real unsigned transactions (0-2 approvals + the swap itself)
// for the connected wallet to sign -- always re-quoted server-side at this
// exact moment rather than reusing an earlier preview, so the minimum-out
// baked into the swap reflects the current pool state as closely as
// possible right before signing.
export const getSwapPlan = createServerFn({ method: "POST" })
  .validator(
    (input: { fromSymbol: string; toSymbol: string; amountIn: number; walletAddress: string }) =>
      input,
  )
  .handler(async ({ data }): Promise<SwapPlan | null> => {
    const res = await apiFetch(
      "/swap/plan",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      },
      [404, 422],
    );
    if (res.status === 404 || res.status === 422) return null;
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

export const getCause = createServerFn({ method: "GET" })
  .validator((causeId: number) => causeId)
  .handler(async ({ data: causeId }): Promise<Cause | null> => {
    const res = await apiFetch(`/causes/${causeId}`);
    if (res.status === 404) return null;
    return (await res.json()) as Cause;
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
  .validator(
    (input: { token: string; recipient: string; amount: string; sendToken: "native" | "usdg" }) =>
      input,
  )
  .handler(async ({ data }): Promise<{ created: boolean; id: number }> => {
    const res = await apiFetch("/private-sends", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${data.token}` },
      body: JSON.stringify({
        recipient: data.recipient,
        amount: data.amount,
        token: data.sendToken,
      }),
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

/* ---------- relay.link cross-chain intent endpoints ---------- */

export interface RelayQuoteRequest {
  user: string;
  originCurrency: string;
  destinationCurrency?: string;
  amount: string;
  recipient?: string;
  txs?: Array<{ to: `0x${string}`; data: `0x${string}`; value: string }>;
  originChainId?: number;
  destinationChainId?: number;
  tradeType?: "EXACT_INPUT" | "EXACT_OUTPUT";
}

/** GET /hashtags/user/:handle — is this X account linked to a wallet yet? */
export interface XAccountLookup {
  handle: string;
  linked: boolean;
  wallet: string | null;
  /** Present only when they can receive a direct Solana transfer. */
  solanaWallet: string | null;
  hashtags: { hashtag: string; name: string | null; total_volume_usd: number }[];
}

export const getXAccount = createServerFn({ method: "GET" })
  .validator((handle: string) => handle.trim().replace(/^@+/, "").toLowerCase())
  .handler(async ({ data: handle }): Promise<XAccountLookup | null> => {
    if (!/^[a-z0-9_]{1,15}$/.test(handle)) return null;
    const res = await apiFetch(
      `/hashtags/user/${encodeURIComponent(handle)}`,
      undefined,
      [400, 404],
    );
    if (!res.ok) return null;
    return (await res.json()) as XAccountLookup;
  });

export const getRelayQuote = createServerFn({ method: "POST" })
  .validator((input: RelayQuoteRequest) => input)
  // Relay's quote is a large, evolving nested document (steps, fees, details,
  // route). Callers narrow the parts they use (RelayQuoteLike, RelayStep);
  // mirroring the whole thing here would just be a shape that goes stale.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    const res = await apiFetch("/relay/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return await res.json();
  });

export const getRelayIntentStatus = createServerFn({ method: "GET" })
  .validator((requestId: string) => requestId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data: requestId }): Promise<any> => {
    const res = await apiFetch(`/relay/intent/${encodeURIComponent(requestId)}`);
    return await res.json();
  });
