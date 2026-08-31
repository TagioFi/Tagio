# TagioFi v2 — Complete Frontend Integration & Architectural Specification

> **Core Philosophy**: **"Your tag knows what you want to be paid in."**
>
> **TagioFi v2** is a non-custodial, **receive-side Real-World Asset (RWA) settlement rail on Robinhood Chain (Chain ID: 4663)**. Senders pay in whatever asset they hold (ETH, USDG, or tokenized equities). Receivers set their target portfolio mix once (e.g. `60% SPCX`, `30% USDG`, `10% NVDA`). The rail automatically routes and swaps inbound payments via **Uniswap V4 / V3 & Relay.link** into the receiver's elected assets in a single atomic transaction.

---

## 1. Environments & Network Configuration

| Parameter | Value | Details |
| :--- | :--- | :--- |
| **Live Production API** | `https://api.tagiopay.com` | Primary API Host |
| **Local Development API** | `http://localhost:3001` | Backend Port 3001 |
| **Network** | **Robinhood Chain** | Arbitrum L2 Rollup |
| **Chain ID** | **`4663`** (`0x1237`) | Canonical Mainnet ID |
| **RPC Endpoints** | `https://rpc.mainnet.chain.robinhood.com`<br>`https://robinhood-rpc.publicnode.com` | Live & CORS Open |
| **Block Explorer** | `https://robinhoodchain.blockscout.com` | Mainnet Blockscout |
| **Protocol Fee Treasury** | `0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9` | 0.15% (15 bps) on Swaps |

---

## 2. Token Registry & Verified Onchain Contracts (Chain ID: 4663)

All assets trade natively on Robinhood Chain with deep liquidity on **Uniswap V4 / V3**:

| Symbol | Asset Name / Description | Contract Address | Decimals | Type |
| :--- | :--- | :--- | :--- | :--- |
| **`USDG`** | Global Dollar (Canonical Stablecoin) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 6 | Base Stablecoin |
| **`ETH`** | Native Ether | `0x0000000000000000000000000000000000000000` | 18 | Native Gas |
| **`WETH`** | Wrapped Ether | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 18 | Wrapped Native |
| **`SPCX`** | SpaceX (Space Exploration Technologies Corp.) | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | 18 | Equity Token |
| **`AAPL`** | Apple Inc. Token | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | 18 | Equity Token |
| **`TSLA`** | Tesla Inc. Token | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | 18 | Equity Token |
| **`NVDA`** | NVIDIA Corp. Token | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | 18 | Equity Token |
| **`GOOGL`** | Alphabet Inc. Token | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | 18 | Equity Token |
| **`AMZN`** | Amazon.com Inc. Token | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | 18 | Equity Token |
| **`MSFT`** | Microsoft Corp. Token | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | 18 | Equity Token |
| **`META`** | Meta Platforms Inc. Token | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | 18 | Equity Token |
| **`COIN`** | Coinbase Global Inc. Token | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | 18 | Equity Token |

---

## 3. Core Settlement Flow

```
                               Sender Payment
                       (Pays in ETH, USDG, or Equities)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TagioFi v2 Settlement Engine (4663)                      │
│                                                                             │
│  1. Resolve Target Receiver (@tag, #tag, or 0x address)                     │
│  2. Hydrate Receiver Target Portfolio Elections (Sum of bps = 10,000)       │
│  3. Calculate Best Execution Route per Leg:                                │
│     - Same-Token: Direct Transfer (0% Fee, instant transfer step)           │
│     - Base Pairs: Relay.link Same-Chain Bridge Quote (0.15% Protocol Fee)   │
│     - Equities: Robinhood Uniswap V4 / V3 Quoter + SwapRouter Calldata      │
│  4. Assemble Complete Executable Steps Array for User's Wallet Client       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
                      Single User Wallet Signature
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
      60% SPCX                   30% USDG                   10% NVDA
(SpaceX Tokenized Equity)    (Global Dollar)         (NVIDIA Tokenized Equity)
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      ▼
                        Receiver Wallet Token Accounts
                         (100% Non-Custodial & Atomic)
```

---

## 4. Tag Ownership & Authentication Architecture

TagioFi v2 onboarding is a **two-step, mandatory sequence**:

```
Connect wallet  ──▶  Connect X  ──▶  Dashboard
   (step 1)          (step 2)        (/app opens)
```

Wallet ownership decides which tags an address may edit; the verified X handle is the name `@TagioPayBot` settles against when someone tweets a payment. A wallet that has not completed the X hop has **no dashboard access** — there is no skip path, and every owner-scoped fetch (`/v2/handles/owner/:wallet`, elections, invoices) stays unissued until both steps are done.

### A. Step 1 — Wallet Ownership (`POST /v2/handles/register`)
Tags are owned by an EVM address on Robinhood Chain, and ownership is enforced by wallet signature. Claiming happens *inside* the dashboard, so it is reachable only after step 2.

### B. Step 2 — Twitter/X Account Linking (`POST /v2/auth/signin` & `GET /v2/auth/x/callback`)
1. Frontend calls `POST /v2/auth/signin` with `{ walletAddress, signature, message }`, where `message` is the canonical TagioFi sentence followed by wallet / chain / issued-at / nonce lines.
2. Backend answers with either:
   * `{ token, xLinked: true, xHandle, handle }` — this wallet is already bound to an X account, or
   * `{ needsXLink: true, authorizeUrl: "https://x.com/i/oauth2/authorize?..." }`.
3. On `needsXLink` the frontend performs a **full-page navigation** to `authorizeUrl` (X is another origin — never a `fetch`), remembering the page to return to.
4. User authorizes on X → redirected to `GET /v2/auth/x/callback`.
5. Backend updates `v2_handles` with the verified `x_user_id` / `x_handle` and redirects to `FRONTEND_URL/auth/callback#token=<jwt>&xHandle=<handle>`. The JWT rides in the **fragment**, so it never reaches a server log or a `Referer` header.
6. `/auth/callback` (`src/routes/auth.callback.tsx`) decodes the JWT's `walletAddress`, stores `{ token, walletAddress, xHandle, expiresAt }`, strips the fragment from the address bar, and returns the user to the page that started the hop (default `/app`).

Failures come back as `FRONTEND_URL/auth/callback?error=<code>`; `expired_or_invalid_state` and `access_denied` get their own copy.

### C. Step 3 — Claim the X username as a tag
Immediately after the X hop the dashboard offers the verified username as a tag, because it is the name people already use to mention the receiver.

* Availability is probed with `GET /v2/handles/:handle` — a `404` means free, a `200` means taken.
* Free → a one-click **Claim @username** that `POST /v2/handles/register`s it (defaults to 100% USDG until a mix is set).
* Taken by another wallet → the card says so and points at the normal claim form instead of failing at submit.
* Already owned by this wallet, or not a legal tag (`^[a-z0-9_]{3,32}$`) → the card never appears.
* The prompt is dismissible (`Not now`) and never blocks the dashboard.

`POST /v2/handles/register` itself refuses a wallet with no verified X identity (`403 { needsXLink: true }`), so this ordering is enforced server-side too.

### D. Session Rules (frontend)
* The session is keyed to the wallet that signed for it. Disconnecting, or switching accounts in the wallet, clears it immediately — a stale session must never render another address's tags.
* An expired JWT (`exp` is decoded client-side for display only, never trusted for authorization) drops the session and returns the user to step 2.
* `src/hooks/useTagioAuth.ts` owns the state machine: `restoring → connect-wallet → link-x → linking → ready`. `<AuthGate>` (`src/components/tf/auth-gate.tsx`) renders the dashboard only in `ready`.
* `GET /v2/auth/me` is the authority on a live session: a `401`/`403` signs the user out, `isLinked: false` sends them back to step 2, and its `xHandle` wins over the locally stored copy. Network and 5xx failures never sign anyone out.
* Senders are **not** gated: `/pay/$target` needs no signature and no X account.

---

## 5. Pending Transactions, Bot Flows & Pay Links

### A. X Bot Automated Settlement
1. A user mentions `@TagioPayBot send @vlad 40 usdg` on Twitter.
2. The bot parses the command via Groq AI (`llama-3.3-70b-versatile`) and saves a pending record in the `pending_transactions` table with a unique `request_id` (e.g. `pnd_8f3a1b`).
3. The bot replies with the pay link: `https://tagiopay.com/pay/pnd_8f3a1b`.

### B. Dynamic Pay Route (`/pay/$target`)
The pay page at `src/routes/pay.$target.tsx` resolves `$target` polymorphically:
* **Handle / Tag** (e.g. `/pay/nobody` or `/pay/alex`): Resolves the receiver's live portfolio and allows the sender to enter any custom payment amount and token.
* **Pending Bot Payment** (e.g. `/pay/pnd_...`): Automatically pre-populates the locked sender, amount, and recipient allocation.
* **Invoice Pay-Link** (e.g. `/pay/inv_...`): Fetches invoice details via `GET /v2/invoices/:invoiceId` and settles directly into the current portfolio mix.

---

## 6. Complete REST API Reference

### A. Assets & Catalog

#### `GET /v2/assets`
Returns directory of verified Robinhood tokenized equities, ETFs, and base currencies (`ETH`, `USDG`).
* **Query Parameters**:
  * `q` *(optional)*: Search string (e.g. `apple`, `spacex`, `tesla`, `nvidia`).
  * `featured` *(optional)*: `true` to return featured assets only.

#### `GET /v2/assets/:symbolOrAddress`
Resolves aliases and contract addresses (e.g. `SPCX` $\rightarrow$ `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa`).

---

### B. Handles & Receive-Mix Preferences

#### `GET /v2/handles/:handle`
Fetches tag ownership, metadata, and active portfolio elections.

#### `POST /v2/handles/register`
Claims/registers a tag for a connected EVM wallet on Robinhood Chain.
* **Body**:
```json
{
  "handle": "alex",
  "ownerWallet": "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9",
  "displayName": "Alex Turner",
  "elections": [
    { "symbol": "SPCX", "basisPoints": 6000 },
    { "symbol": "USDG", "basisPoints": 3000 },
    { "symbol": "NVDA", "basisPoints": 1000 }
  ]
}
```

#### `PUT /v2/handles/:handle/elections`
Updates the tag's target portfolio allocation (validates that total basis points sum to `10000` / 100%).
* **Headers**: `Authorization: Bearer <jwt>` (or `ownerWallet` in body).

#### `GET /v2/handles/owner/:walletAddress`
Lists all tags owned by a specific wallet.

---

### C. Multi-Leg Routing & Settlement Engine

#### `POST /v2/settle/quote` (Single Pair Quote)
Quotes a single token-to-token swap via Uniswap V4 / V3 / Relay on Robinhood Chain with 0.15% protocol fee.
* Returns executable `steps` array ready for wallet signing.

#### `POST /v2/settle/election-quote` (Portfolio Multi-Leg Quote)
Allocates inbound payment amount across the recipient's elected portfolio and quotes all legs concurrently.
* **Body**:
```json
{
  "recipientHandle": "alex",
  "fromSymbolOrAddress": "USDG",
  "amountIn": 100,
  "userWallet": "0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9"
}
```
* **Response**: Returns full breakdown per leg with expected RWA outputs, price impact, and serialized transaction `steps`.

#### `POST /v2/settle/confirm`
Records confirmed settlement transaction signature and receipt in the database.

---

### D. Invoices & Pay Requests

#### `POST /v2/invoices`
Generates a unique invoice pay-link.
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

### E. Groq AI Bot Endpoints

#### `POST /v2/bot/parse-intent`
Parses free-text tweets using Groq AI (`llama-3.3-70b-versatile`) into structured intents.
* **Body**: `{ "text": "@TagioPayBot send @vlad 40 usdg" }`

#### `POST /v2/bot/route-intent`
Routes free text or structured parameters into a complete transaction execution plan.

---

## 7. Guardrails & Execution Rules

1. **Same-Asset Zero Fee**: 1:1 conversions (e.g. USDG $\rightarrow$ USDG or ETH $\rightarrow$ ETH) incur 0% swap fees and execute via a single direct transfer step.
2. **Protocol Fee**: Automatically attached to Uniswap / Relay swap quotes at **0.15% (15 bps)** routed to fee treasury `0x4DDe86fE8383F7bEe8b120a525938260Aa5050F9`.
3. **Slippage Protection**: Thin-pool swap slippage tolerances scale dynamically with price impact. If an RWA leg fails liquidity, it safe-settles into **USDG**.
