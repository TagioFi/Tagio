# TagioPay Frontend Integration Guide

Internal document for the frontend developer. Not required reading for backend/contracts work.

---

## Repo layout

Monorepo. Here's what lives where:

```
/                        ← Next.js frontend (your domain)
  app/                   ← App Router pages
  components/            ← shadcn UI components
  lib/utils.ts           ← cn() utility
  .env / .env.example    ← frontend env vars

/backend/                ← Bun + Express API (NOT yours — do not touch)
  src/routes/            ← hashtags, resolve, transactions, auth, health
  src/services/onchain/  ← viem client + resolver ABI
  db/migrations/         ← Postgres schema

/contracts/              ← Foundry (Solidity) — NOT yours
  src/HashtagResolver.sol
  src/HashtagNFT.sol
```

---

## Backend URL

Not deployed yet. Locally:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```
Will be updated here once there's a live URL.

---

## Contract addresses

Not deployed yet — Robinhood Chain RPC/chain ID and deployed addresses will be added
here once available. You'll need the resolver address + ABI to build any transactions
yourself (register/pay/update) directly from the frontend via viem/wagmi — the backend
does not submit transactions, it only reads and indexes them.

The resolver ABI (functions + events) lives at `backend/src/services/onchain/abi.ts`
and mirrors `contracts/src/HashtagResolver.sol` — copy it into your wagmi/viem config.

---

## Core flow

1. **Register/pay/update onchain directly** — the frontend calls the resolver contract
   itself (register, receivePayment, updatePayouts, updateMetadata, renewSubscription,
   transferViaRecoveryPhrase). The backend does not do this for you.
2. **Confirm with the backend** — after every onchain action, call:

   `POST /hashtags/confirm-transaction`
   ```json
   { "tx_hash": "0x...", "hashtag_raw": "#finance" }
   ```
   The backend fetches the receipt, decodes the resolver's events, and syncs Postgres.
   Do this immediately after the transaction confirms, before reading the hashtag back.

---

## Endpoints

### `GET /hashtags/check/:name`
```json
{ "available": true }
```

### `GET /hashtags/:name`
Full hashtag record:
```json
{
  "hashtag": "finance",
  "owner_wallet": "0x...",
  "name": "...",
  "image_url": "...",
  "website_url": "...",
  "active": true,
  "registered_at": "...",
  "expires_at": "...",
  "total_volume_usd": 0,
  "payouts": [{ "wallet": "0x...", "percentage_bps": 10000 }],
  "socials": [{ "key": "twitter", "value": "@linda" }]
}
```

### `GET /hashtags/resolve/:hashtag`
Fast path for payment routing / social bots (Redis-cached, 60s TTL):
```json
{
  "hashtag": "finance",
  "primaryDestination": "0x...",
  "payouts": [{ "wallet": "0x...", "percentage_bps": 10000 }],
  "expiresAt": "..."
}
```
404 if the hashtag isn't active.

### `POST /hashtags/confirm-transaction`
See "Core flow" above.

### `GET /transactions/hashtag?hashtag=...`
```json
[{ "signature": "0x...", "amount": "...", "token": "...", "is_native": true, "chain": "robinhood", "timestamp": "..." }]
```

### `POST /auth/signin`
```json
{ "walletAddress": "0x...", "signature": "0x...", "message": "Welcome to TagioPay! Please sign this message to verify your wallet ownership." }
```
→ `{ "token": "<jwt>" }`. Send back as `Authorization: Bearer <token>` on any
protected route added later.

---

## Namespace rules (client-side validation, mirrors the contract)

- Normalize: strip leading `#`, lowercase.
- Pattern: `^[a-z0-9_]{3,32}$`.
- Payout splits must sum to exactly `10000` bps before you submit `updatePayouts` onchain — the contract will revert otherwise, but validate client-side first for a good error message.
