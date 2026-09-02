/**
 * TagioFi v2 data models.
 *
 * Mirrors `technical-docs/frontend-integration-v2.md` §3. v2 is the receive-side
 * RWA settlement rail on Robinhood Chain: a receiver elects a target portfolio
 * in basis points, and any inbound payment settles atomically into it.
 */

// ── RWA & Token Types ───────────────────────────────────────────────────────

export type V2AssetType = "native" | "stablecoin" | "equity" | "etf" | "commodity";

export interface V2TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  isBaseCurrency?: boolean;
  underlyingTicker?: string;
  iconUrl?: string;
  assetType: V2AssetType;
}

export interface V2AssetsResponse {
  baseCurrencies: V2TokenInfo[];
  featured: V2TokenInfo[];
  total: number;
  assets: V2TokenInfo[];
}

// ── Handle & Election Types ────────────────────────────────────────────────

export interface V2ElectionRow {
  id: number;
  handleId: number;
  symbol: string;
  tokenAddress: string;
  decimals: number;
  /** 100 bps = 1.00%. Sum of active elections must equal 10,000. */
  basisPoints: number;
  /** e.g. 60 = 60.00% */
  percentage: number;
  isActive: boolean;
  token?: V2TokenInfo | null;
}

export interface V2HandleDetails {
  id: number;
  handle: string;
  ownerWallet: string;
  xUserId: string | null;
  xHandle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  metadata: Record<string, unknown>;
  elections: V2ElectionRow[];
  totalBasisPoints: number;
  createdAt: string;
  updatedAt: string;
}

/** Election shape accepted by register / update endpoints. */
export interface V2ElectionInput {
  symbol: string;
  basisPoints: number;
}

export interface V2RegisterHandleBody {
  handle: string;
  ownerWallet: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  elections?: V2ElectionInput[];
}

export interface V2UpdateElectionsBody {
  ownerWallet: string;
  elections: V2ElectionInput[];
}

// ── Settlement & Quote Types ───────────────────────────────────────────────

/**
 * One wallet transaction inside a quote step, ready to hand to the wallet
 * client verbatim.
 */
export interface V2StepTxData {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
  chainId?: number;
}

export interface V2StepItem {
  status: "not_started" | "incomplete" | "complete" | string;
  data: V2StepTxData;
}

/**
 * A leg of the execution plan. The quote engine emits them in the order they
 * must be sent — an ERC20 `approve` first when the router needs an allowance,
 * then the `swap` (or `transfer`, for a same-asset settle).
 */
export interface V2QuoteStep {
  id: "approve" | "swap" | "transfer" | (string & {});
  action: string;
  description?: string;
  kind: "transaction" | (string & {});
  items: V2StepItem[];
}

export interface SingleSwapQuoteResult {
  fromToken: V2TokenInfo;
  toToken: V2TokenInfo;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  rate: string;
  priceImpactPct: number;
  timeEstimate: number;
  requestId?: string;
  steps?: V2QuoteStep[];
}

export interface PortfolioQuoteLegResult {
  assetSymbol: string;
  assetAddress: string;
  basisPoints: number;
  percentage: number;
  allocatedInAmount: string;
  allocatedInAmountFormatted: string;
  quote: SingleSwapQuoteResult;
  /** True when the leg breached slippage and safe-settled into USDG instead. */
  isFallbackUsdg?: boolean;
}

export interface PortfolioSettlementQuoteResult {
  recipientHandle?: string | null;
  recipientWallet: string;
  inputToken: V2TokenInfo;
  totalInAmount: string;
  totalInAmountFormatted: string;
  legs: PortfolioQuoteLegResult[];
}

export interface V2SingleQuoteBody {
  fromSymbolOrAddress: string;
  toSymbolOrAddress: string;
  amountIn: number;
  userWallet?: string;
}

export interface V2ElectionQuoteBody {
  recipientHandle: string;
  fromSymbolOrAddress: string;
  amountIn: number;
  userWallet?: string;
}

/**
 * Field names here are the ones POST /v2/settle/confirm actually destructures
 * off the body — they deliberately do NOT mirror the quote request's
 * `fromSymbolOrAddress`/`amountIn`. `senderWallet`, `recipientWallet`,
 * `inputTokenSymbol` and `inputAmount` are all required; omitting any one of
 * them is a 400.
 */
export interface V2ConfirmSettlementBody {
  senderWallet: string;
  recipientWallet: string;
  recipientHandle?: string | null;
  txHash: string;
  requestId?: string;
  inputTokenSymbol: string;
  inputTokenAddress?: string;
  inputAmount: string;
  outputBreakdown?: Array<{ assetSymbol: string; basisPoints: number; amountOut?: string }>;
  feeCollectedUsd?: number;
}

/** The persisted settlement row echoed back by POST /v2/settle/confirm. */
export interface V2SettlementRecord {
  id: number;
  request_id: string | null;
  tx_hash: string | null;
  sender_wallet: string;
  recipient_handle: string | null;
  recipient_wallet: string;
  input_token_symbol: string;
  input_token_address: string;
  input_amount: string;
  output_breakdown: unknown[];
  fee_collected_usd: number;
  created_at: string;
}

// ── Invoicing & Bot Types ──────────────────────────────────────────────────

export type V2InvoiceStatus = "pending" | "paid" | "expired";

export interface V2Invoice {
  id: number;
  invoice_id: string;
  recipient_handle: string;
  recipient_wallet: string;
  target_amount: string;
  target_token_symbol: string;
  memo: string | null;
  status: V2InvoiceStatus;
  expiry_at: string;
  created_at: string;
}

export interface V2CreateInvoiceBody {
  recipientHandle: string;
  targetAmount: number;
  targetTokenSymbol: string;
  memo?: string;
}

export type V2BotAction =
  | "send"
  | "swap"
  | "invoice"
  | "election"
  | "escrow"
  | "giveaway"
  | "airdrop"
  | "unrecognized";

export interface V2ParsedBotIntent {
  action: V2BotAction;
  target: string | null;
  targetType: "x_account" | "hashtag" | "wallet" | null;
  amount: number | null;
  token: string | null;
  fromToken?: string | null;
  toToken?: string | null;
  memo: string | null;
  elections: V2ElectionInput[] | null;
  confidence: number;
}

// ── Response envelopes ──────────────────────────────────────────────────────
//
// A few v2 endpoints wrap their payload instead of returning it bare. The
// hooks in `useTagioV2.ts` unwrap these so components keep seeing the flat
// shapes above.

/** GET /v2/handles/owner/:wallet */
export interface V2OwnerHandlesResponse {
  ownerWallet: string;
  total: number;
  handles: V2HandleDetails[];
}

/** GET /v2/invoices/:invoiceId */
export interface V2InvoiceResponse {
  invoice: V2Invoice;
  isExpired: boolean;
  handleDetails: V2HandleDetails | null;
}

/** POST /v2/invoices */
export interface V2CreateInvoiceResponse {
  invoice: V2Invoice;
  payUrl: string;
  handleDetails: V2HandleDetails | null;
}

export interface V2PendingTransaction {
  id: number;
  request_id: string;
  sender_handle?: string | null;
  sender_address?: string | null;
  recipient_identifier?: string | null;
  recipient_address?: string | null;
  amount: string;
  token: string;
  status: "pending" | "broadcasted" | "cancelled";
  tweet_id?: string | null;
  created_at: string;
  expires_at?: string | null;
}

// ── Auth: wallet → X → dashboard ────────────────────────────────────────────
//
// v2 ownership is wallet-first, but the rail is X-native: the bot settles
// against verified X identities, so a wallet only reaches the dashboard once
// it has been bound to an X account. POST /v2/auth/signin answers with one of
// the two shapes below.

/** The wallet is verified and already bound to an X account. */
export interface V2SignInAuthorized {
  token: string;
  xLinked: true;
  xHandle: string | null;
  /** First tag owned by this wallet, when it already has one. */
  handle?: string | null;
  needsXLink?: false;
}

/** The wallet is verified; X authorization is still outstanding. */
export interface V2SignInNeedsX {
  needsXLink: true;
  /** x.com OAuth 2.0 PKCE URL — a full-page navigation, not a fetch. */
  authorizeUrl: string;
  token?: undefined;
  xLinked?: false;
}

export type V2SignInResponse = V2SignInAuthorized | V2SignInNeedsX;

/**
 * What the browser keeps between visits once both steps are done. The backend
 * only ever issues a v2 JWT after the X hop, so holding an unexpired token for
 * the connected wallet *is* the "X linked" signal; `xHandle` is for display.
 */
export interface V2Session {
  walletAddress: string;
  xHandle: string | null;
  xUserId?: string | null;
  /** JWT expiry in epoch ms; null when the token carried no `exp`. */
  expiresAt: number | null;
}

/** GET /v2/auth/me — the API's own view of the bearer token's session. */
export interface V2AuthMeResponse {
  authenticated: boolean;
  walletAddress: string;
  xUserId: string | null;
  xHandle: string | null;
  /** False when the wallet's X binding is gone — the user must link again. */
  isLinked: boolean;
  handles: Array<{ handle: string; display_name: string | null }>;
}

/**
 * Row shape behind `GET /v2/pending/tx/:id` (the `pending_transactions` table).
 *
 * A bot-prepared swap stores the pair as `token` → `target_value` with
 * `target_type = "swap"`; payment mentions put a handle or address in
 * `target_value` instead, which is why the trade terminal only pre-fills when
 * the row is a swap.
 */
export interface V2PendingTxRow {
  id: number;
  /** The wallet-scoped listing aliases `id` to this. */
  request_id?: number | string | null;
  source_ref?: string | null;
  requested_by_x_user_id?: string | null;
  target_type?: string | null;
  target_value?: string | null;
  resolved_to_wallet?: string | null;
  requested_by_wallet?: string | null;
  token?: string | null;
  amount?: string | null;
  amount_base_units?: string | null;
  kind?: string | null;
  status?: string | null;
  tweet_url?: string | null;
  quote_route?: string | null;
  price_impact_pct?: number | string | null;
  created_at?: string | null;
  expires_at?: string | null;
  is_sender?: boolean;
  sender_x_handle?: string | null;
}

export interface V2PendingTxResponse {
  transaction: V2PendingTxRow;
  handleDetails: V2HandleDetails | null;
  isExpired: boolean;
}
