# TagioFi v2 — Complete Frontend Integration & Architectural Specification

> **Core Philosophy**: **"Your tag knows what you want to be paid in."**
>
> **TagioFi v2** is a non-custodial, **receive-side Real-World Asset (RWA) settlement rail on Robinhood Chain**. While traditional payment rails dictate what token the sender must send, TagioFi lets receivers set their target portfolio once (e.g. `60% SPYR`, `30% USDG`, `10% GLDR`). Any inbound payment in ETH, USDG, or tokenized equities settles atomically via **Relay.link same-chain intent routing** into the receiver's elected assets in a single transaction.

---

## 1. Environments & Base Endpoints

| Environment | Base URL | Status |
| :--- | :--- | :--- |
| **Live Production API** | `https://api.tagiopay.com` | Active |
| **Local Development API** | `http://localhost:3001` | Active |
| **Network** | Robinhood Chain (`13746` / `4663`) | Active |
| **Protocol Fee Treasury** | `0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9` | 0.15% (15 bps) |

All v2 endpoints are mounted under the **`/v2/`** prefix. Authenticated requests include:
```http
Authorization: Bearer <JWT_TOKEN>
```

---

## 2. Core Execution Architecture

```
                          Sender Payment
                      (Pays ETH / USDG / Any Token)
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   TagioFi v2 Multi-Leg Settlement Rail                 │
│                                                                        │
│  1. Resolve Receiver Tag / Handle & Portfolio Elections (bps)          │
│  2. Relay.link Same-Chain Quoting (Robinhood Chain ID: 13746)          │
│  3. Calculate Best-Execution Route per Asset Leg (0.15% App Fee)       │
│  4. Assemble Atomic Transaction Bundle (Zero Held Balances / Custody)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
                   Single Wallet Signature (Sender)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
    60% SPYR                  30% USDG                  10% GLDR
(S&P 500 Tokenized ETF)    (Global Dollar)        (Tokenized Gold)
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   ▼
                     Receiver Wallet Token Accounts
                     (100% Non-Custodial & Atomic)
```

---

## 3. TypeScript Interfaces & Data Models

Export these types in your frontend codebase (e.g., `src/types/tagio-v2.ts`):

```typescript
// ── RWA & Token Types ───────────────────────────────────────────────────────

export interface V2TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
  isBaseCurrency?: boolean;
  underlyingTicker?: string;
  iconUrl?: string;
  assetType: "native" | "stablecoin" | "equity" | "etf" | "commodity";
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
  basisPoints: number; // 100 bps = 1.00% (Sum of active elections must = 10,000)
  percentage: number;  // e.g. 60 = 60.00%
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
  metadata: Record<string, any>;
  elections: V2ElectionRow[];
  totalBasisPoints: number;
  createdAt: string;
  updatedAt: string;
}

// ── Settlement & Quote Types ───────────────────────────────────────────────

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
  steps?: any[];
}

export interface PortfolioQuoteLegResult {
  assetSymbol: string;
  assetAddress: string;
  basisPoints: number;
  percentage: number;
  allocatedInAmount: string;
  allocatedInAmountFormatted: string;
  quote: SingleSwapQuoteResult;
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

// ── Invoicing & Bot Types ──────────────────────────────────────────────────

export interface V2Invoice {
  id: number;
  invoice_id: string;
  recipient_handle: string;
  recipient_wallet: string;
  target_amount: string;
  target_token_symbol: string;
  memo: string | null;
  status: "pending" | "paid" | "expired";
  expiry_at: string;
  created_at: string;
}

export interface V2ParsedBotIntent {
  action: "send" | "invoice" | "election" | "unrecognized";
  target: string | null;
  targetType: "x_account" | "hashtag" | "wallet" | null;
  amount: number | null;
  token: string | null;
  memo: string | null;
  elections: { symbol: string; basisPoints: number }[] | null;
  confidence: number;
}
```

---

## 4. Complete REST API Reference

### A. RWA Token Registry

#### `GET /v2/assets`
Returns directory of verified Robinhood tokenized equities, ETFs, commodities, and base currencies (`ETH`, `USDG`).
* **Query Parameters**:
  * `q` *(optional)*: Search string (e.g. `apple`, `SPY`, `tesla`, `gold`).
  * `featured` *(optional)*: `true` to return only featured assets.

```typescript
const res = await fetch("https://api.tagiopay.com/v2/assets?featured=true");
const data: V2AssetsResponse = await res.json();
```

#### `GET /v2/assets/:symbolOrAddress`
Quick lookup and alias resolution (e.g. `SPYR` $\rightarrow$ `0x1111111111111111111111111111111111111111`).

---

### B. Handle & Portfolio Elections

#### `GET /v2/handles/:handle`
Fetches tag ownership, profile metadata, and active portfolio allocation.

```typescript
const res = await fetch("https://api.tagiopay.com/v2/handles/alex");
const handleData: V2HandleDetails = await res.json();
```

#### `POST /v2/handles/register`
Claims/registers a tag for a connected EVM wallet on Robinhood Chain.
* **Body**:
```json
{
  "handle": "alex",
  "ownerWallet": "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9",
  "displayName": "Alex Turner",
  "avatarUrl": "https://...",
  "bio": "Building on Robinhood Chain",
  "elections": [
    { "symbol": "SPYR", "basisPoints": 6000 },
    { "symbol": "USDG", "basisPoints": 3000 },
    { "symbol": "GLDR", "basisPoints": 1000 }
  ]
}
```

#### `PUT /v2/handles/:handle/elections`
Updates the tag's target portfolio allocation (validates that total basis points sum to `10000` / 100%).

```typescript
const res = await fetch("https://api.tagiopay.com/v2/handles/alex/elections", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ownerWallet: "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9",
    elections: [
      { "symbol": "NVDAR", "basisPoints": 7000 },
      { "symbol": "USDG", "basisPoints": 3000 }
    ]
  })
});
```

#### `GET /v2/handles/owner/:walletAddress`
Lists all tags owned by a specific wallet.

---

### C. Multi-Leg Routing & Settlement

#### `POST /v2/settle/quote` (Single Pair Quote)
Quotes a single token-to-token swap via Relay on Robinhood Chain with 0.15% fee.
* **Body**:
```json
{
  "fromSymbolOrAddress": "ETH",
  "toSymbolOrAddress": "SPYR",
  "amountIn": 0.5,
  "userWallet": "0x..."
}
```

#### `POST /v2/settle/election-quote` (Portfolio Multi-Leg Quote)
Takes inbound payment amount in ETH or USDG, automatically allocates it across the recipient's elected portfolio, and quotes all legs concurrently via Relay.
* **Body**:
```json
{
  "recipientHandle": "alex",
  "fromSymbolOrAddress": "USDG",
  "amountIn": 1000,
  "userWallet": "0x..."
}
```
* **Response**: Returns full breakdown with allocated amounts, expected RWA outputs, and Relay transaction steps.

#### `POST /v2/settle/confirm`
Records confirmed settlement transaction signature and receipt in the database.

---

### D. Invoices & Pay-Links

#### `POST /v2/invoices`
Generates a unique invoice pay-link (e.g. `tagiopay.com/pay/inv_abc123`).
* **Body**:
```json
{
  "recipientHandle": "alex",
  "targetAmount": 250,
  "targetTokenSymbol": "USDG",
  "memo": "Frontend Development Milestone 1"
}
```

#### `GET /v2/invoices/:invoiceId`
Retrieves invoice status, amount, and recipient's active portfolio election.

---

### E. Groq AI Natural Language Bot Endpoints

#### `POST /v2/bot/parse-intent`
Parses free-text tweets using Groq AI (`llama-3.3-70b-versatile`) into structured intents.
* **Body**: `{ "text": "@TagioPayBot send @vlad 40 usdg" }`
* **Response**:
```json
{
  "action": "send",
  "target": "@vlad",
  "targetType": "x_account",
  "amount": 40,
  "token": "USDG",
  "confidence": 1.0
}
```

#### `POST /v2/bot/route-intent`
Routes free text or structured parameters into a complete transaction execution plan.

---

### F. Authentication & X OAuth 2.0 PKCE

* `POST /v2/auth/signin`: Sign in with EVM signature (Robinhood Chain).
* `GET /v2/auth/x/callback`: Dedicated v2 OAuth 2.0 PKCE callback handler.

---

## 5. Ready-to-Use React / TanStack Query Hooks

Drop these custom hooks into your frontend (e.g., `src/hooks/useTagioV2.ts`):

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";

const API_BASE = "https://api.tagiopay.com";

// 1. Hook: Fetch Handle Details & Elections
export function useV2Handle(handle: string) {
  return useQuery({
    queryKey: ["v2-handle", handle],
    queryFn: async () => {
      if (!handle) return null;
      const clean = handle.replace(/^#|^@/, "");
      const res = await fetch(`${API_BASE}/v2/handles/${clean}`);
      if (!res.ok) throw new Error("Handle not found");
      return res.json();
    },
    enabled: Boolean(handle),
  });
}

// 2. Hook: Search Robinhood RWA Asset Catalog
export function useV2Assets(query: string = "", featuredOnly: boolean = false) {
  return useQuery({
    queryKey: ["v2-assets", query, featuredOnly],
    queryFn: async () => {
      const url = new URL(`${API_BASE}/v2/assets`);
      if (featuredOnly) url.searchParams.set("featured", "true");
      if (query) url.searchParams.set("q", query);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

// 3. Hook: Calculate Multi-Leg Election Quote
export function useV2ElectionQuote(params: {
  handle?: string;
  fromToken: string;
  amount: number | string;
  userWallet?: string;
}) {
  return useQuery({
    queryKey: ["v2-election-quote", params.handle, params.fromToken, params.amount],
    queryFn: async () => {
      if (!params.handle || !params.amount || Number(params.amount) <= 0) return null;
      const res = await fetch(`${API_BASE}/v2/settle/election-quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientHandle: params.handle,
          fromSymbolOrAddress: params.fromToken,
          amountIn: Number(params.amount),
          userWallet: params.userWallet,
        }),
      });
      if (!res.ok) throw new Error("Failed to calculate settlement quote");
      return res.json();
    },
    enabled: Boolean(params.handle && Number(params.amount) > 0),
    refetchInterval: 15000,
  });
}

// 4. Hook: Groq AI Intent Parser
export function useParseBotIntent() {
  return useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`${API_BASE}/v2/bot/parse-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Failed to parse intent");
      return res.json();
    },
  });
}
```

---

## 6. Guardrails & Honest Boundaries

1. **Protocol Fee**: Automatically attached to Relay quotes at **0.15% (15 bps)** routed to `0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9`.
2. **Slippage Protection & Fallback**: If any RWA leg breaches slippage bounds, it safe-settles into **USDG** rather than executing a bad fill.
3. **Same-Asset Zero Fee**: Paying directly in the token the recipient holds (e.g. USDG $\rightarrow$ USDG) is fee-free and bypasses DEX routing.
