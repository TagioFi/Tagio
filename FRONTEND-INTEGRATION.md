# TagioPay Frontend Integration Guide

> **Core Philosophy**: **"Executed on Solana, Settled on Robinhood"**
>
> Users interact entirely on **Solana** using Solana wallets (**Phantom**, **Solflare**, **Backpack**) with **SOL** and **USDC**. Complex onchain logic (hashtag registry NFTs, multi-wallet fan-out splits, escrows, causes, shielded private pool) is settled seamlessly on Robinhood Chain via **Relay.link** cross-chain intent solvers.

---

## 1. Product Positioning & Terminology

* **Surface**: Solana (Fast confirmations, low fees, standard Solana wallet adapters).
* **Working Currencies**: Strictly **`SOL`** (9 decimals) and **`USDC`** (6 decimals).
* **Tokenized Stocks (xStocks)**: 714+ 1:1 asset-backed US equities & ETFs (Apple, Tesla, NVIDIA, Google, S&P 500) trading natively as Solana SPL tokens (see [`backend/src/lib/rwaTokens.ts`](file:///home/skipp/Documents/gigs/qpay/tagiopay/backend/src/lib/rwaTokens.ts)).
* **Branding Guideline**: Position TagioPay as an ultra-fast Solana product. Subtly communicate that programmable splits and identity registries settle securely on Robinhood Chain in the background.

---

## 2. Architecture & Execution Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TAGIOPAY FRONTEND (SOLANA)                      │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
      Direct Send & xStocks Swaps          Contract Calls (Splits/Escrows)
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌────────────────────────┐
       │   Solana Native/SPL    │       │ Relay.link (0.15% Fee) │
       │ (SystemProgram / DEX)  │       │     /relay/quote       │
       └────────────────────────┘       └────────────┬───────────┘
                                                     │
                                                     ▼
                                        ┌────────────────────────┐
                                        │ Robinhood Chain L2     │
                                        │ Smart Contracts        │
                                        └────────────────────────┘
```

| Action | Execution Method | Currency / Asset | Routing Details |
| :--- | :--- | :--- | :--- |
| **Direct Send** | Solana Transfer | SOL / USDC | Direct Solana transaction to recipient's base58 address. No bridge/Relay. |
| **Trade Stocks** | Solana DEX (Jupiter) | SOL/USDC ↔ `AAPLx`, `TSLAx`, etc. | Direct Solana SPL swap to the xStock mint. No cross-chain bridge. |
| **Hashtag Send (`#handle`)** | Relay.link Quote | SOL / USDC | Routes to Robinhood `HashtagResolver.receivePayment()` with **0.15% fee** for onchain multi-split payouts. |
| **Register / Renew Handle** | Relay.link Quote | SOL / USDC | Routes to `HashtagResolver.registerHashtag()` / `renewSubscription()` with **0.15% fee**; mints `HashtagNFT`. |
| **Unlinked `@handle` Deposit** | Relay.link Quote | SOL / USDC | Deposits to `ClaimEscrow` with **0.15% fee** until recipient connects X. |
| **Freelance Escrow** | Relay.link Quote | SOL / USDC | Locks funds in `SimpleEscrow` with **0.15% fee**; released upon milestone completion. |
| **Causes & Donations** | Relay.link Quote | SOL / USDC | Deposits to `CauseRegistry` with **0.15% fee**; updates verified donor leaderboards. |
| **Private Send (`$psend`)** | Relay.link Quote | SOL / USDC | Deposits to `PrivateSendPool` with **0.15% fee**; auto-claimed to recipient by backend keeper. |

---

## 3. Solana Wallet Authentication & X Linking

TagioPay uses a 2-step verification: **Solana Wallet Signature + X (Twitter) OAuth 2.0 PKCE**.

### Step 1: Sign in with Solana Wallet
Sign the exact message with the connected wallet:
```typescript
const SIGNIN_MESSAGE = "Welcome to TagioPay! Please sign this message to verify your wallet ownership.";

// In frontend using @solana/wallet-adapter-react:
const encoded = new TextEncoder().encode(SIGNIN_MESSAGE);
const signatureBytes = await signMessage(encoded);
const signature = bs58.encode(signatureBytes);

const res = await fetch("http://localhost:3001/auth/signin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    walletAddress: publicKey.toBase58(),
    signature,
    message: SIGNIN_MESSAGE,
  }),
});
const data = await res.json();
```

### Step 2: Handle Response
* If already linked: Returns `{ token: "<jwt>", xLinked: true, xHandle: "alice" }`. Store JWT in `localStorage`.
* If new user: Returns `{ needsXLink: true, authorizeUrl: "https://twitter.com/i/oauth2/authorize?..." }`.
  Redirect the user: `window.location.href = data.authorizeUrl;`.
* After X redirects back to `/auth/callback#token=<jwt>`, store the JWT and navigate to the dashboard.

---

## 4. Relay.link Cross-Chain Intent Integration

For any operation that interacts with smart contracts (Hashtags, Splits, Escrows, Causes):

### 1. Request Quote & Solana Instructions (`POST /relay/quote`)
```typescript
const quote = await fetch("http://localhost:3001/relay/quote", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    user: publicKey.toBase58(), // User's Solana wallet
    originCurrency: "11111111111111111111111111111111", // SOL (or USDC: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
    amount: "100000000", // Amount in base units
    txs: [
      {
        to: "<ROBINHOOD_CONTRACT_ADDRESS>",
        data: "<ENCODED_CALLDATA>",
        value: "0",
      },
    ],
  }),
}).then(r => r.json());
```

### 2. Sign and Execute on Solana
Relay returns serialized `steps` containing Solana transaction instructions. Deserialize and sign with `sendTransaction` via `@solana/wallet-adapter-react`.

### 3. Track Status (`GET /relay/intent/:requestId`)
Poll `GET /relay/intent/${quote.requestId}` until status is `success` or `refunded`.

---

## 5. Tokenized Equities (xStocks on Solana)

Token definitions are available via `GET /tokens`.

| Ticker | Name | Solana SPL Mint Address |
| :--- | :--- | :--- |
| **`AAPLx`** | Apple | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| **`TSLAx`** | Tesla | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| **`NVDAx`** | NVIDIA | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` |
| **`GOOGLx`** | Alphabet | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` |
| **`AMZNx`** | Amazon | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` |
| **`MSFTx`** | Microsoft | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` |
| **`METAx`** | Meta | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` |
| **`COINx`** | Coinbase | `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu` |
| **`SPYx`** | S&P 500 ETF | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| **`QQQx`** | Nasdaq 100 ETF | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` |
| **`PLTRx`** | Palantir | `XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4` |
| **`AMDx`** | AMD | `XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF` |
| **`NFLXx`** | Netflix | `XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL` |

---

## 6. Complete Backend REST API Reference

All requests requiring authentication accept the header `Authorization: Bearer <token>`.

### Authentication
* `POST /auth/signin`: Verifies Solana (ed25519) or EVM signature. Returns JWT or OAuth URL.
* `GET /auth/x/callback`: OAuth callback handler. Redirects to `/auth/callback#token=...`.

### Hashtags & Identity
* `GET /hashtags/resolve/:hashtag`: Returns destination wallet(s), fan-out payout splits, and social links (<50ms cached).
* `GET /hashtags/check/:hashtag`: Checks availability (`{ available: boolean }`).
* `GET /hashtags/user/:walletAddress`: Lists all hashtags owned by or routing to this wallet.
* `POST /hashtags/confirm-transaction`: Synchronizes onchain registration/renewal events.

### Cross-Chain Relay (0.15% Protocol Fee)
* `POST /relay/quote`: Builds cross-chain quote from Solana (SOL/USDC) to Robinhood smart contracts.
* `GET /relay/intent/:requestId`: Tracks cross-chain transaction status.

### Trading & Swaps
* `GET /tokens`: Returns base currencies (`SOL`, `USDC`) and 714+ Solana xStocks equities.
* `POST /swap/quote`: Fetches price quote and route between SOL/USDC and equities.
* `POST /swap/plan`: Prepares execution steps for token swaps.

### Escrows & Causes
* `GET /escrows?wallet=:address`: Lists active bilateral freelance escrows.
* `GET /causes`: Lists registered public donation causes and leaderboards.
* `GET /private-sends?wallet=:address`: Lists shielded transfers and claim statuses.
* `GET /pending-transactions`: Lists pending bot requests requiring user confirmation.

---

## 7. Hashtag Namespace & Lifecycle Rules

* **Format**: `^[a-z0-9_]{3,32}$` (lowercase, numbers, underscores, 3-32 characters).
* **Subscription**: 30-day lease duration.
* **Grace Period**: 72 hours after expiry before handle can be claimed by another user.
* **Payout Splits**: Up to 10 destination wallets summing to exactly 100% (10,000 basis points).
